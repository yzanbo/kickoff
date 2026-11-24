// プロバイダーの適合テストの adapter: 共通の台本（FakeAgentScript）の出来事を、各 AI の偽物（偽の SDK・偽の app-server・偽のクライアント・偽の ACP のエージェント）の手続きへ写す。テストからだけ使う
import { fakeClaudeSdk, type FakeClaudeSdk } from "./fakeClaudeSdk";
import { fakeCodexServer, fakeAcpAgent, type FakeAcpAgent, type FakeCodexServer } from "@/features/ai/core/testing/fakeStdioServer";
import { fakeCopilotClient, type FakeCopilotSession } from "@/features/ai/core/testing/fakeCopilotClient";
import { ClaudeProvider } from "@/features/ai/core/providers/claude/provider";
import { CodexProvider } from "@/features/ai/core/providers/codex/provider";
import { CopilotProvider } from "@/features/ai/core/providers/copilot/provider";
import type { SessionConfig } from "@/features/ai/core/providers/copilot/sdk";
import { cursorProvider } from "@/features/ai/core/providers/cursor/provider";
import { holdPoint, lastText, type FakeAgentAnswer, type ProviderAdapter } from "@/features/ai/core/providers/testing/contract";

const answerOf = (allowed: boolean): FakeAgentAnswer => (allowed ? "allow" : "deny");
/** 届いた知らせ・答えを流し切る（setImmediate 1 回。時間では待たない） */
const tick = () => new Promise((r) => setImmediate(r));

/**
 * Claude: 守りのフック（PreToolUse）が決めなければ、Claude Code と同じく権限モードが決める
 * （計画モードは断る・Auto mode は通す・ほかは canUseTool で聞く）
 */
async function claudeAsk(q: FakeClaudeSdk["queries"][number], command: string): Promise<FakeAgentAnswer> {
  const outputs = await q.hook("PreToolUse", { tool_name: "Bash", tool_input: { command }, tool_use_id: `t-${command}` });
  const decided = outputs.map((o) => (o as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision).find(Boolean);
  if (decided) return answerOf(decided === "allow");
  if (q.options.permissionMode === "plan") return "deny";
  if (q.options.permissionMode === "auto") return "allow";
  return answerOf(((await q.canUseTool("Bash", { command })) as { behavior: string }).behavior === "allow");
}

export const claudeAdapter: ProviderAdapter = {
  id: "claude",
  tellAtTurnEnd: false,
  crashError: /exited with code 2/,
  make(script) {
    const fake = fakeClaudeSdk();
    const hold = holdPoint();
    const answers: FakeAgentAnswer[] = [];
    fake.onQuery = async (q) => {
      q.emit({ type: "system", subtype: "init", model: "claude-test", permissionMode: q.options.permissionMode ?? "default" });
      for (const step of script.steps) {
        if (step.type === "tool_use") q.emit({ type: "assistant", message: { content: [{ type: "tool_use", id: step.id, name: "Bash", input: { command: step.command } }] } });
        else if (step.type === "tool_result") q.emit({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: step.id, content: step.output }] } });
        else if (step.type === "text") q.emit({ type: "assistant", message: { content: [{ type: "text", text: step.text }] } });
        else if (step.type === "ask") answers.push(await claudeAsk(q, step.command));
        else await hold.wait();
      }
      if (script.end === "crashed") q.fail(new Error("Claude Code process exited with code 2"));
      else q.finish({ result: lastText(script) ?? "ok" });
    };
    return {
      provider: new ClaudeProvider({ sdk: fake.sdk, executable: "claude" }),
      holding: hold.reached,
      release: hold.release,
      answers,
      told: () => fake.queries.flatMap((q) => q.received.slice(1).map((m) => String(m.message.content))),
      resumedFrom: () => fake.queries[0]?.options.resume ?? null,
      launches: () => fake.queries.map(({ options }) => ({ args: [...Object.entries(options.extraArgs ?? {}).flat().map(String), ...(options.executableArgs ?? [])], env: options.env ?? {} })),
      toolConfig: () => fake.queries.map((q) => q.options.mcpServers),
    };
  },
};

/** Codex: ターンが始まったら台本を流し、turn/completed で終える。止める頼み（turn/interrupt）は interrupted で終える */
export const codexAdapter: ProviderAdapter = {
  id: "codex",
  tellAtTurnEnd: false,
  crashError: /終了コード 2/,
  make(script) {
    const server: FakeCodexServer = fakeCodexServer();
    const hold = holdPoint();
    const answers: FakeAgentAnswer[] = [];
    let threadId = "";
    const complete = (status: string) => server.notify("turn/completed", { threadId, turn: { id: "turn-1", status, error: null } });
    async function play() {
      const ids = { threadId, turnId: "turn-1" };
      const commands = new Map<string, string>();
      server.notify("turn/started", { threadId, turn: { id: "turn-1", status: "inProgress", error: null } });
      for (const [i, step] of script.steps.entries()) {
        if (step.type === "tool_use") {
          commands.set(step.id, step.command);
          server.notify("item/started", { ...ids, item: { type: "commandExecution", id: step.id, command: step.command, cwd: "/w", aggregatedOutput: null, exitCode: null, status: "inProgress" } });
        } else if (step.type === "tool_result") {
          server.notify("item/completed", { ...ids, item: { type: "commandExecution", id: step.id, command: commands.get(step.id), cwd: "/w", aggregatedOutput: step.output, exitCode: 0, status: "completed" } });
        } else if (step.type === "text") server.notify("item/completed", { ...ids, item: { type: "agentMessage", id: `m${i}`, text: step.text } });
        else if (step.type === "ask") {
          const reply = await server.request("item/commandExecution/requestApproval", { ...ids, itemId: `c${i}`, command: step.command });
          answers.push(answerOf(String(reply.decision).startsWith("accept")));
        } else await hold.wait();
      }
      if (script.end === "crashed") server.crash(2);
      else complete("completed");
    }
    server.handle("turn/start", (p) => {
      threadId = p.threadId;
      setImmediate(() => void play());
      return { turn: { id: "turn-1", status: "inProgress", error: null } };
    });
    server.handle("turn/interrupt", () => {
      setImmediate(() => complete("interrupted"));
      return {};
    });
    const sent = (method: string) => server.requests.filter((r) => r.method === method).map((r) => r.params);
    return {
      provider: new CodexProvider({ spawn: server.spawn }),
      holding: hold.reached,
      release: hold.release,
      answers,
      told: () => sent("turn/steer").map((p) => p.input[0].text),
      resumedFrom: () => sent("thread/resume")[0]?.threadId ?? null,
      launches: () => server.spawned.map(({ args, env }) => ({ args, env })),
      toolConfig: () => [...sent("thread/start"), ...sent("thread/resume")].map((p) => p.config),
    };
  },
};

/** Copilot: 送られた指示ごとに台本を流し、手を空けて（session.idle）終える。作業中に足した発言（immediate）では流さない */
export const copilotAdapter: ProviderAdapter = {
  id: "copilot",
  tellAtTurnEnd: false,
  crashError: /ランタイムが終了しました/,
  make(script) {
    const fake = fakeCopilotClient();
    const hold = holdPoint();
    const answers: FakeAgentAnswer[] = [];
    const permit = (s: FakeCopilotSession, req: Record<string, unknown>) => (s.config as SessionConfig).onPermissionRequest!(req as never, { sessionId: s.sessionId });
    fake.onSend = async (s, prompt, mode) => {
      if (mode === "immediate") return;
      s.emit("user.message", { content: prompt });
      for (const [i, step] of script.steps.entries()) {
        if (step.type === "tool_use") s.emit("tool.execution_start", { toolCallId: step.id, toolName: "bash", arguments: { command: step.command } });
        else if (step.type === "tool_result") s.emit("tool.execution_complete", { toolCallId: step.id, success: true, result: { content: step.output } });
        else if (step.type === "text") s.emit("assistant.message", { content: step.text, messageId: `m${i}` });
        else if (step.type === "ask") answers.push(answerOf((await permit(s, { kind: "shell", fullCommandText: step.command, intention: "", toolCallId: `c${i}` })).kind.startsWith("approve")));
        else await hold.wait();
      }
      if (script.end === "crashed") s.emit("session.error", { errorType: "query", message: "Copilot のランタイムが終了しました" });
      s.idle();
    };
    return {
      provider: new CopilotProvider({ clientFactory: fake.factory }),
      holding: hold.reached,
      release: hold.release,
      answers,
      told: () => fake.sessions.flatMap((s) => s.sent.filter((x) => x.mode === "immediate").map((x) => x.prompt)),
      resumedFrom: () => fake.sessions.find((s) => s.resumed)?.sessionId ?? null,
      launches: () => fake.clients.map(({ env }) => ({ args: [], env })),
      toolConfig: () => fake.sessions.map((s) => s.config.mcpServers),
    };
  },
};

/** ACP（Cursor）: 最初の指示（session/prompt）で台本を流し、終わりの理由を返す。あとの指示（預かった発言・断った理由）はすぐ終える */
export const acpAdapter: ProviderAdapter = {
  id: "acp",
  tellAtTurnEnd: true,
  crashError: /終了コード 2/,
  make(script) {
    // http の MCP と続き（session/resume）を受けるエージェント
    const agent: FakeAcpAgent = fakeAcpAgent({ mcpCapabilities: { http: true }, sessionCapabilities: { resume: {} } });
    const hold = holdPoint();
    const answers: FakeAgentAnswer[] = [];
    let prompts = 0;
    agent.handle("session/prompt", async (p, s) => {
      if (prompts++ > 0) return { stopReason: "end_turn" };
      const update = (u: Record<string, unknown>) => s.notify("session/update", { sessionId: p.sessionId, update: u });
      for (const step of script.steps) {
        if (step.type === "tool_use") update({ sessionUpdate: "tool_call", toolCallId: step.id, title: step.command, kind: "execute", status: "pending", rawInput: { command: step.command } });
        else if (step.type === "tool_result") update({ sessionUpdate: "tool_call_update", toolCallId: step.id, status: "completed", content: [{ type: "content", content: { type: "text", text: step.output } }] });
        else if (step.type === "text") update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: step.text } });
        else if (step.type === "ask") {
          const options = [
            { optionId: "allow-once", name: "Allow", kind: "allow_once" },
            { optionId: "reject-once", name: "Reject", kind: "reject_once" },
          ];
          const reply = await s.request("session/request_permission", { sessionId: p.sessionId, toolCall: { toolCallId: step.command, title: step.command, kind: "execute", rawInput: { command: step.command } }, options });
          answers.push(answerOf(String(reply.outcome?.optionId).startsWith("allow")));
        } else if ((await Promise.race([hold.wait().then(() => "released"), agent.waitFor("session/cancel").then(() => "cancelled")])) === "cancelled") return { stopReason: "cancelled" };
      }
      if (script.end === "crashed") {
        s.crash(2);
        return new Promise(() => {});
      }
      await tick();
      return { stopReason: "end_turn" };
    });
    const sent = (method: string) => agent.requests.filter((r) => r.method === method).map((r) => r.params);
    return {
      provider: cursorProvider({ spawn: agent.spawn }),
      holding: hold.reached,
      release: hold.release,
      answers,
      told: () => sent("session/prompt").slice(1).map((p) => p.prompt[0].text),
      resumedFrom: () => sent("session/resume")[0]?.sessionId ?? null,
      launches: () => agent.spawned.map(({ args, env }) => ({ args, env })),
      toolConfig: () => [...sent("session/new"), ...sent("session/resume")].map((p) => p.mcpServers),
    };
  },
};

export const PROVIDER_ADAPTERS: readonly ProviderAdapter[] = [claudeAdapter, codexAdapter, copilotAdapter, acpAdapter];
