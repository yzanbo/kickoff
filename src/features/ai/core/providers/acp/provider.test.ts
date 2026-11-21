// ACP の共通のプロバイダー（Cursor・Gemini）を偽の ACP のエージェントで確かめる（本物の agent・agy・アカウントは使わない）
import { test } from "vitest";
import { withGate } from "@/app/core/testing/testGate";
import assert from "node:assert/strict";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import { fakeAcpAgent, type FakeAcpAgent } from "@/features/ai/core/testing/fakeStdioServer";
import { until } from "@/app/core/testing/testCore";
import type { AgentProvider, ApprovalRequest, ProviderCallbacks, ProviderTurnParams, TurnControl } from "@/features/ai/core/providers/types";
import { cursorProvider } from "@/features/ai/core/providers/cursor/provider";
import { GEMINI_NEEDS_API_KEY, geminiProvider } from "@/features/ai/core/providers/gemini/provider";

/** 本物の守りの門を付けて動かす（門の承認カードも同じ cb で聞く） */
const guardedRun = (provider: AgentProvider, p: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal) => provider.run(withGate(p, cb.requestApproval, signal), cb, signal);

const params = (extra: Partial<ProviderTurnParams> = {}) =>
  ({
    cwd: "/w",
    prompt: "やって",
    promptId: "u-1",
    systemPrompt: "Kickoff の文脈",
    policy: { allowedCommands: [], web: true },
    resumeSessionId: null,
    model: null,
    effort: null,
    permissionMode: "default",
    fastMode: false,
    autoCompactPct: null,
    additionalDirectories: [],
    tools: [{ name: "kickoff_chat", url: "http://127.0.0.1:9/mcp/kickoff_chat", headers: { Authorization: "Bearer secret-key" }, autoAllow: ["list_family_chats"] }],
    ...extra,
  }) as ProviderTurnParams;

/** 知らせを覚え、承認には answer で答えるコールバック */
function recorder(answer: (req: ApprovalRequest) => ApprovalDecision = () => ({ action: "allow" })) {
  const events: any[] = [];
  const approvals: ApprovalRequest[] = [];
  const streamed: string[] = [];
  let control: TurnControl | null = null;
  const cb: ProviderCallbacks = {
    emit: (e) => events.push(e),
    stream: (t) => streamed.push(t),
    requestApproval: async (req) => {
      approvals.push(req);
      return answer(req);
    },
    control: (c) => {
      control = c;
    },
  };
  return { cb, events, approvals, streamed, control: () => control };
}

const update = (s: FakeAcpAgent, u: Record<string, unknown>, sessionId = "ses-1") => s.notify("session/update", { sessionId, update: u });

/** 指示（session/prompt）を受けたら台本を流し、終わりの理由を返す（何回目の指示か n で分けられる） */
function onPrompt(agent: FakeAcpAgent, script: (s: FakeAcpAgent, n: number, p: any) => Promise<string | void> | string | void) {
  let n = 0;
  agent.handle("session/prompt", async (p, s) => ({ stopReason: (await script(s, n++, p)) ?? "end_turn" }));
}
const tick = () => new Promise((r) => setImmediate(r));
const permission = (s: FakeAcpAgent, toolCall: Record<string, unknown>) =>
  s.request("session/request_permission", {
    sessionId: "ses-1",
    toolCall,
    options: [
      { optionId: "allow-once", name: "Allow", kind: "allow_once" },
      { optionId: "allow-always", name: "Always", kind: "allow_always" },
      { optionId: "reject-once", name: "Reject", kind: "reject_once" },
    ],
  });

test("実行: JSON-RPC 2.0 で初期化して新しいセッションを作り、返答とコマンドを Claude Code と同じ形の記録にする（毎回聞くモードにし、http の MCP とシステムプロンプトは受けるときだけ渡す）", async () => {
  const agent = fakeAcpAgent({ mcpCapabilities: { http: true }, sessionCapabilities: { systemPrompt: {} } }, [{ id: "cursor_login", name: "Cursor" }]);
  onPrompt(agent, async (s) => {
    update(s, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "考え中" } });
    update(s, { sessionUpdate: "tool_call", toolCallId: "t1", title: "ls", kind: "execute", status: "pending", rawInput: { command: ["ls", "-a"] } });
    update(s, { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed", content: [{ type: "content", content: { type: "text", text: "a.ts" } }] });
    update(s, { sessionUpdate: "tool_call", toolCallId: "t2", title: "Edit a.ts", kind: "edit", status: "pending" });
    update(s, { sessionUpdate: "tool_call_update", toolCallId: "t2", status: "completed", content: [{ type: "diff", path: "/w/a.ts", oldText: "x", newText: "y" }] });
    update(s, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "でき" } });
    update(s, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ました" } });
    update(s, { sessionUpdate: "usage_update", used: 30, size: 200, cost: { amount: 0.01, currency: "USD" } });
    await tick();
  });
  const rec = recorder();
  const result = await cursorProvider({ spawn: agent.spawn, env: { PATH: "/bin", CURSOR_API_KEY: "leak" } }).run(params(), rec.cb, new AbortController().signal);

  assert.deepEqual(result, { status: "completed", sessionId: "ses-1", result: "できました", context: { tokens: 30, window: 200 }, costUsd: 0.01 });
  assert.ok(agent.lines.every((l) => l.jsonrpc === "2.0"));
  assert.deepEqual(agent.spawned[0].args, ["acp"]);
  assert.equal(agent.spawned[0].env.CURSOR_API_KEY, undefined, "サブスクでは手元の鍵の環境変数を外す");
  assert.deepEqual(await agent.waitFor("authenticate"), { methodId: "cursor_login" });
  const created = await agent.waitFor("session/new");
  assert.deepEqual(created.mcpServers, [{ type: "http", name: "kickoff_chat", url: "http://127.0.0.1:9/mcp/kickoff_chat", headers: [{ name: "Authorization", value: "Bearer secret-key" }] }]);
  assert.deepEqual(created.systemPrompt, { mode: "append", content: [{ type: "text", text: "Kickoff の文脈" }] });
  assert.deepEqual(await agent.waitFor("session/set_mode"), { sessionId: "ses-1", modeId: "default" });
  assert.deepEqual((await agent.waitFor("session/prompt")).prompt, [{ type: "text", text: "やって" }], "システムプロンプトを受けるなら指示に混ぜない");
  assert.ok(!agent.spawned[0].args.join(" ").includes("secret-key") && !JSON.stringify(agent.spawned[0].env).includes("secret-key"), "MCP の鍵は引数・環境変数に載せない");
  assert.deepEqual(
    rec.events.map((e) => [e.type, e.name ?? e.text ?? e.content]),
    [
      ["init", undefined],
      ["thinking", "考え中"],
      ["tool_use", "Bash"],
      ["tool_result", "a.ts"],
      ["tool_use", "Edit"],
      ["tool_result", ""],
      ["text", "できました"],
    ],
  );
  assert.deepEqual(rec.events[2].input, { command: "ls -a" });
  assert.deepEqual(rec.events[4].input, { file_path: "/w/a.ts", old_string: "x", new_string: "y" });
  assert.deepEqual(rec.streamed, ["でき", "ました"]);
});

test("初期化の答えで分ける: http の MCP を受けないなら AI の操作ツールを渡さず、システムプロンプトを受けないなら新しいセッションの最初の指示の頭に添える", async () => {
  const agent = fakeAcpAgent({});
  await guardedRun(cursorProvider({ spawn: agent.spawn }), params({ turnContext: "子チャットです" }), recorder().cb, new AbortController().signal);
  const created = await agent.waitFor("session/new");
  assert.deepEqual(created.mcpServers, []);
  assert.equal(created.systemPrompt, undefined);
  const prompt = (await agent.waitFor("session/prompt")).prompt.map((b: any) => b.text);
  assert.deepEqual(prompt, ["<kickoff_context>\nKickoff の文脈\n</kickoff_context>", "子チャットです", "やって"]);
});

test("続き: session/resume があればそれ、なければ session/load（流し直す会話は記録にしない）、どちらもなければ新しい会話とお知らせ", async () => {
  const resumeAgent = fakeAcpAgent({ sessionCapabilities: { resume: {} }, loadSession: true });
  await guardedRun(cursorProvider({ spawn: resumeAgent.spawn }), params({ resumeSessionId: "old" }), recorder().cb, new AbortController().signal);
  assert.equal((await resumeAgent.waitFor("session/resume")).sessionId, "old");
  assert.ok(!resumeAgent.requests.some((r) => r.method === "session/load"));
  assert.equal((await resumeAgent.waitFor("session/prompt")).prompt.length, 1, "続きではシステムプロンプトを添えない");

  const loadAgent = fakeAcpAgent({ loadSession: true });
  loadAgent.handle("session/load", async (p, s) => {
    update(s, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "前の返答" } }, "old");
    await tick();
    return { sessionId: p.sessionId };
  });
  const rec = recorder();
  const result = await guardedRun(cursorProvider({ spawn: loadAgent.spawn }), params({ resumeSessionId: "old" }), rec.cb, new AbortController().signal);
  assert.equal(result.sessionId, "old");
  assert.ok(!rec.events.some((e) => e.type === "text"), "流し直した会話は記録にしない");

  const none = fakeAcpAgent({});
  const rec2 = recorder();
  const fresh = await guardedRun(cursorProvider({ spawn: none.spawn }), params({ resumeSessionId: "old" }), rec2.cb, new AbortController().signal);
  assert.equal(fresh.sessionId, "ses-1");
  assert.ok(rec2.events.some((e) => e.type === "notice" && e.message.includes("新しい会話")));
});

test("権限の頼み: 消すコマンドは守りで断り、理由を次の指示で伝える。毎回確認のファイルの変更はカードで聞き、読むのは聞かずに通す", async () => {
  const agent = fakeAcpAgent({});
  const answers: any[] = [];
  onPrompt(agent, async (s, n) => {
    if (n > 0) return;
    answers.push(await permission(s, { toolCallId: "c1", title: "rm -rf build", kind: "execute", rawInput: { command: "rm -rf build" } }));
    answers.push(await permission(s, { toolCallId: "e1", title: "Edit a.ts", kind: "edit", locations: [{ path: "/w/a.ts" }], content: [{ type: "diff", path: "/w/a.ts", oldText: "a", newText: "b" }] }));
    answers.push(await permission(s, { toolCallId: "r1", title: "Read a.ts", kind: "read", locations: [{ path: "/w/a.ts" }] }));
  });
  const rec = recorder((req) => (req.toolName === "Edit" ? { action: "allow_always" } : { action: "deny", message: "" }));
  const result = await guardedRun(cursorProvider({ spawn: agent.spawn }), params({ deleteGuard: true }), rec.cb, new AbortController().signal);
  assert.equal(result.status, "completed");
  assert.deepEqual(
    answers.map((a) => a.outcome.optionId),
    ["reject-once", "allow-always", "allow-once"],
  );
  assert.deepEqual(rec.approvals.map((a) => a.toolName), ["Edit"], "守りが断るコマンド・読むのはカードを出さない");
  const prompts = agent.requests.filter((r) => r.method === "session/prompt");
  assert.equal(prompts.length, 2);
  assert.match(prompts[1].params.prompt[0].text, /［Kickoff］「rm -rf build」を断りました: .*kickoff-trash/);
});

test("権限モード: Auto mode は通し、計画モードは plan のモードにして変更を断る（理由は伝え直さない）。コアの MCP サーバーの聞かずに使わせるツールは通す", async () => {
  const auto = fakeAcpAgent({});
  const autoAnswers: any[] = [];
  onPrompt(auto, async (s) => {
    autoAnswers.push(await permission(s, { toolCallId: "c1", title: "npm test", kind: "execute", rawInput: { command: "npm test" } }));
  });
  const autoRec = recorder(() => ({ action: "deny", message: "" }));
  await guardedRun(cursorProvider({ spawn: auto.spawn }), params({ permissionMode: "auto" }), autoRec.cb, new AbortController().signal);
  assert.equal(autoAnswers[0].outcome.optionId, "allow-once");
  assert.equal(autoRec.approvals.length, 0);
  assert.equal((await auto.waitFor("session/set_mode")).modeId, "default", "Auto mode でもエージェントは毎回聞くモード");

  const plan = fakeAcpAgent({});
  const planAnswers: any[] = [];
  onPrompt(plan, async (s) => {
    planAnswers.push(await permission(s, { toolCallId: "e1", title: "Edit", kind: "edit", locations: [{ path: "/w/a.ts" }] }));
    planAnswers.push(await permission(s, { toolCallId: "m1", title: "mcp__kickoff_chat__list_family_chats", kind: "other", rawInput: {} }));
  });
  await guardedRun(cursorProvider({ spawn: plan.spawn }), params({ permissionMode: "plan" }), recorder().cb, new AbortController().signal);
  assert.equal((await plan.waitFor("session/set_mode")).modeId, "plan");
  assert.deepEqual(planAnswers.map((a) => a.outcome.optionId), ["reject-once", "allow-once"]);
  assert.equal(plan.requests.filter((r) => r.method === "session/prompt").length, 1);
});

test("作業中に伝える: ACP に足す口はないので預かり、いまの指示が終わったら同じ実行の中で次の指示として送る", async () => {
  const agent = fakeAcpAgent({});
  const rec = recorder();
  onPrompt(agent, async (s, n) => {
    if (n === 0) {
      await until(() => rec.control() !== null);
      assert.equal(rec.control()!.tell("これも"), true);
    } else update(s, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "了解" } });
    await tick();
  });
  const result = await guardedRun(cursorProvider({ spawn: agent.spawn }), params(), rec.cb, new AbortController().signal);
  const prompts = agent.requests.filter((r) => r.method === "session/prompt");
  assert.deepEqual(prompts[1].params.prompt, [{ type: "text", text: "これも" }]);
  assert.equal(result.result, "了解");
  assert.equal(rec.control(), null, "終わったら作業中の操作を外す");
});

test("止める: session/cancel を送り、cancelled で終わる。答えを待っている権限の頼みは cancelled で返す", async () => {
  const agent = fakeAcpAgent({});
  const ctrl = new AbortController();
  let answer: any;
  agent.handle("session/prompt", async (_p, s) => {
    const pending = permission(s, { toolCallId: "c1", title: "npm test", kind: "execute", rawInput: { command: "npm test" } });
    await agent.waitFor("session/cancel");
    answer = await pending;
    return { stopReason: "cancelled" };
  });
  const rec = recorder(() => new Promise<ApprovalDecision>(() => {}) as unknown as ApprovalDecision);
  rec.cb.requestApproval = (_req, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("止めた"))));
  const running = guardedRun(cursorProvider({ spawn: agent.spawn }), params(), rec.cb, ctrl.signal);
  await until(() => agent.requests.some((r) => r.method === "session/prompt"));
  await tick();
  ctrl.abort();
  const result = await running;
  assert.equal(result.status, "cancelled");
  assert.deepEqual(answer, { outcome: { outcome: "cancelled" } });
});

test("起動の途中（initialize の答えを待つ間）に止めると、指示を送らずに中断で返す", async () => {
  const agent = fakeAcpAgent({});
  const ctrl = new AbortController();
  agent.handle("initialize", () => {
    ctrl.abort();
    return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
  });
  const result = await guardedRun(cursorProvider({ spawn: agent.spawn }), params(), recorder().cb, ctrl.signal);
  assert.equal(result.status, "cancelled");
  assert.ok(!agent.requests.some((r) => r.method === "session/prompt"));
});

test("落ちたら失敗にして理由を返す", async () => {
  const agent = fakeAcpAgent({});
  agent.handle("session/prompt", (_p, s) => {
    s.crash(2);
    return new Promise(() => {});
  });
  const result = await guardedRun(cursorProvider({ spawn: agent.spawn }), params(), recorder().cb, new AbortController().signal);
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /終了コード 2/);
});

test("Cursor の API キー: CURSOR_API_KEY で渡し（引数には載せない）、Cursor の質問（cursor/ask_question）は質問カードに写して選んだ ID を返す", async () => {
  const agent = fakeAcpAgent({}, [{ id: "cursor_login", name: "Cursor" }]);
  let reply: any;
  onPrompt(agent, async (s) => {
    reply = await s.request("cursor/ask_question", { toolCallId: "q", title: "確認", questions: [{ id: "q1", prompt: "どちら？", options: [{ id: "a", label: "A 案" }, { id: "b", label: "B 案" }] }] });
  });
  const rec = recorder(() => ({ action: "answer", answers: { "どちら？": "B 案" } }) as ApprovalDecision);
  await guardedRun(cursorProvider({ spawn: agent.spawn }), params({ auth: { mode: "api_key", apiKey: "crsr-1" } }), rec.cb, new AbortController().signal);
  assert.equal(agent.spawned[0].env.CURSOR_API_KEY, "crsr-1");
  assert.ok(!agent.spawned[0].args.includes("crsr-1"));
  assert.equal(rec.approvals[0].kind, "question");
  assert.deepEqual(reply, { outcome: { outcome: "answered", answers: [{ questionId: "q1", selectedOptionIds: ["b"] }] } });
});

test("Gemini（agy）: API キーでないなら起動せずに理由を返し、API キーなら GEMINI_API_KEY と gemini-api-key で認証する", async () => {
  const agent = fakeAcpAgent({}, [{ id: "oauth-personal", name: "Google" }, { id: "gemini-api-key", name: "Gemini API key" }]);
  const provider = geminiProvider({ spawn: agent.spawn, env: { GOOGLE_API_KEY: "leak" } });
  const refused = await provider.run(params(), recorder().cb, new AbortController().signal);
  assert.deepEqual(refused, { status: "failed", sessionId: null, error: GEMINI_NEEDS_API_KEY });
  assert.equal(agent.spawned.length, 0);

  const result = await provider.run(params({ auth: { mode: "api_key", apiKey: "AIza-1" } }), recorder().cb, new AbortController().signal);
  assert.equal(result.status, "completed");
  assert.equal(agent.spawned[0].env.GEMINI_API_KEY, "AIza-1");
  assert.equal(agent.spawned[0].env.GOOGLE_API_KEY, undefined);
  assert.deepEqual(await agent.waitFor("authenticate"), { methodId: "gemini-api-key" });
});

test("1 回だけ聞く: 一時のセッションで聞いて返答の文を返し、権限の頼みは断り、消す口があればセッションを消す（Gemini は設定の API キーで）", async () => {
  const agent = fakeAcpAgent({ sessionCapabilities: { delete: {} } }, [{ id: "gemini-api-key", name: "Gemini API key" }]);
  let answer: any;
  onPrompt(agent, async (s) => {
    answer = await permission(s, { toolCallId: "c1", title: "ls", kind: "execute", rawInput: { command: "ls" } });
    update(s, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " 名前案 " } });
    await tick();
  });
  const text = await geminiProvider({ spawn: agent.spawn, authFor: async () => ({ mode: "api_key", apiKey: "AIza-2" }) }).ask("名前を付けて");
  assert.equal(text, "名前案");
  assert.equal(answer.outcome.optionId, "reject-once");
  assert.equal((await agent.waitFor("session/delete")).sessionId, "ses-1");
  assert.equal(agent.spawned[0].env.GEMINI_API_KEY, "AIza-2");
});
