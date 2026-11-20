// Claude のプロバイダーの実行（run）を偽の SDK で確かめる（本物の Claude Code・アカウントは使わない）
import { test, vi } from "vitest";
import assert from "node:assert/strict";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import type { ApiRetryInfo } from "@shared/chat/chatLive";
import { fakeClaudeSdk, type FakeClaudeSdk } from "@/foundation/core/testing/fakeClaudeSdk";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { until } from "@/app/core/testing/testCore";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";
import type { ApprovalRequest, ProviderCallbacks, ProviderTurnParams, TurnControl } from "@/features/ai/core/providers/types";
import { ClaudeProvider } from "./provider";

/** 実行の指定（どのプロバイダーの確かめにも使える最小の形。patch で足す・替える） */
export function turnParams(patch: Partial<ProviderTurnParams> = {}): ProviderTurnParams {
  return {
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
    ...patch,
  };
}

/** 知らせを覚え、承認には answer で答えるコールバック */
export function recorder(answer: (req: ApprovalRequest) => ApprovalDecision = () => ({ action: "allow" })) {
  const events: Parameters<ProviderCallbacks["emit"]>[0][] = [];
  const approvals: ApprovalRequest[] = [];
  const contexts: number[] = [];
  const retries: (ApiRetryInfo | null)[] = [];
  let control: TurnControl | null = null;
  const cb: ProviderCallbacks = {
    emit: (e) => events.push(e),
    requestApproval: async (req) => {
      approvals.push(req);
      return answer(req);
    },
    context: (tokens) => contexts.push(tokens),
    retry: (info) => retries.push(info),
    control: (c) => {
      control = c;
    },
  };
  return { cb, events, approvals, contexts, retries, control: () => control };
}

const provider = (fake: FakeClaudeSdk, self?: SelfInfo) => new ClaudeProvider({ sdk: fake.sdk, executable: "claude", self });
const signal = () => new AbortController().signal;
const usage = (input: number) => ({ input_tokens: input, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
/** query が呼ばれるまで待って、その記録を返す */
async function nextQuery(fake: FakeClaudeSdk, index = 0) {
  await until(() => fake.queries.length > index);
  return fake.queries[index];
}

test("実行: init → ツールの呼び出し → 結果 → 文を記録の形で順に届け、完了とセッション・最後のメッセージ・コンテキストを返す", async () => {
  const fake = fakeClaudeSdk();
  fake.onQuery = (q) => {
    q.emit({ type: "system", subtype: "init", session_id: "s-1", model: "claude-test", permissionMode: "default" });
    q.emit({ type: "assistant", uuid: "m-1", message: { content: [{ type: "tool_use", id: "t-1", name: "Bash", input: { command: "ls" } }], usage: usage(100) } });
    q.emit({ type: "user", uuid: "m-2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t-1", content: "a.ts" }] } });
    q.emit({ type: "assistant", uuid: "m-3", message: { content: [{ type: "text", text: "できました" }], usage: usage(150) } });
    q.finish({ result: "できました" });
  };
  const rec = recorder();
  const result = await provider(fake).run(turnParams(), rec.cb, signal());
  assert.deepEqual(
    rec.events.map((e) => e.type),
    ["init", "tool_use", "tool_result", "text"],
  );
  assert.deepEqual(rec.events[2], { type: "tool_result", tool_use_id: "t-1", content: "a.ts", is_error: false });
  assert.equal(result.status, "completed");
  assert.equal(result.result, "できました");
  assert.equal(result.sessionId, "s-1");
  assert.equal(result.lastMessageId, "m-3");
  assert.deepEqual(result.context, { tokens: 150, window: 200_000 });
  const [q] = fake.queries;
  assert.deepEqual(
    q.received.map((m) => [m.message.content, m.uuid]),
    [["やって", "u-1"]],
  );
  assert.deepEqual(q.options.systemPrompt, { type: "preset", preset: "claude_code", append: "Kickoff の文脈" });
  assert.equal(q.options.pathToClaudeCodeExecutable, "claude");
});

test("続き: resumeSessionId を resume に渡し、存在しないセッションで断られたら resumeSessionMissing を返す", async () => {
  const fake = fakeClaudeSdk();
  const p = provider(fake);
  const resumed = await p.run(turnParams({ resumeSessionId: "s-old" }), recorder().cb, signal());
  assert.equal(fake.queries[0].options.resume, "s-old");
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.sessionId, "s-old");

  const message = "No conversation found with session ID: s-gone";
  fake.onQuery = (q) => {
    q.emit({ type: "result", subtype: "error_during_execution", is_error: true, errors: [message], session_id: "s-gone" });
    q.fail(new Error(`Claude Code returned an error result: ${message}`));
  };
  const missing = await p.run(turnParams({ resumeSessionId: "s-gone" }), recorder().cb, signal());
  assert.equal(missing.status, "failed");
  assert.equal(missing.resumeSessionMissing, true);
});

test("守り: 消すコマンド・フックを飛ばす git・自分を止めるコマンドは、権限モードによらず PreToolUse のフックが断る", async () => {
  const self: SelfInfo = { pids: [4242], dataDir: "/tmp/kickoff-self-test", port: 4317, appName: "Kickoff", guard: { killByName: /\b(pkill|killall)\b/, scripting: { pattern: /\bosascript\b/, label: "AppleScript" } } };
  const commands = ["rm -rf /tmp/x", "git commit --no-verify -m x", "kill -TERM 4242", "ls"];
  for (const permissionMode of ["default", "auto"] as const) {
    const fake = fakeClaudeSdk();
    const denied: Record<string, boolean> = {};
    fake.onQuery = async (q) => {
      for (const command of commands) {
        const outputs = await q.hook("PreToolUse", { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, tool_use_id: "t-1" });
        denied[command] = outputs.some((o) => (o as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision === "deny");
      }
      q.finish();
    };
    await provider(fake, self).run(turnParams({ permissionMode, deleteGuard: true }), recorder().cb, signal());
    assert.deepEqual(denied, { "rm -rf /tmp/x": true, "git commit --no-verify -m x": true, "kill -TERM 4242": true, ls: false }, permissionMode);
  }
});

test("承認: canUseTool が承認を聞き、許せば allow・断れば deny。砂場の中継のツールは聞かずに許す", async () => {
  const fake = fakeClaudeSdk();
  const results: unknown[] = [];
  fake.onQuery = async (q) => {
    results.push(await q.canUseTool("Bash", { command: "npm test" }));
    results.push(await q.canUseTool("Bash", { command: "rm x" }));
    results.push(await q.canUseTool("SandboxNetworkAccess", { host: "example.com" }));
    q.finish();
  };
  const rec = recorder((req) => (req.input.command === "rm x" ? { action: "deny", message: "やめて" } : { action: "allow" }));
  await provider(fake).run(turnParams(), rec.cb, signal());
  assert.deepEqual(
    rec.approvals.map((a) => [a.kind, a.toolName, a.input.command]),
    [
      ["permission", "Bash", "npm test"],
      ["permission", "Bash", "rm x"],
    ],
  );
  assert.deepEqual(results, [
    { behavior: "allow", updatedInput: { command: "npm test" } },
    { behavior: "deny", message: "やめて" },
    { behavior: "allow", updatedInput: { host: "example.com" } },
  ]);
});

test("tell と裏の作業: 作業中に足した発言が入力に届き、stopTask で SDK の stopTask を呼ぶ。終わったら操作を外す", async () => {
  const fake = fakeClaudeSdk();
  fake.onQuery = () => {};
  const rec = recorder();
  const running = provider(fake).run(turnParams(), rec.cb, signal());
  const q = await nextQuery(fake);
  await until(() => rec.control() !== null && q.received.length === 1);
  assert.equal(rec.control()!.tell("追加の指示", "u-2"), true);
  await until(() => q.received.length === 2);
  assert.deepEqual([q.received[1].message.content, q.received[1].uuid], ["追加の指示", "u-2"]);
  await rec.control()!.stopTask("task-1");
  assert.deepEqual(q.stopTask, ["task-1"]);
  q.finish();
  assert.equal((await running).status, "completed");
  assert.equal(rec.control(), null);
});

test("止める: signal を止めると cancelled。結果を返さずに終わったら failed", async () => {
  const fake = fakeClaudeSdk();
  fake.onQuery = () => {};
  const ac = new AbortController();
  const running = provider(fake).run(turnParams(), recorder().cb, ac.signal);
  await nextQuery(fake);
  ac.abort();
  assert.equal((await running).status, "cancelled");

  fake.onQuery = (q) => {
    q.emit({ type: "system", subtype: "init", model: "claude-test", permissionMode: "default" });
    q.end();
  };
  const ended = await provider(fake).run(turnParams(), recorder().cb, signal());
  assert.equal(ended.status, "failed");
  assert.equal(ended.error, "エージェントが結果を返さずに終了しました");
});

test("失敗の分類: 応答のない再試行のあとの失敗は通信の切断、使用枠で断られたあとの失敗は枠が戻る時刻を付ける", async () => {
  const fake = fakeClaudeSdk();
  fake.onQuery = (q) => {
    q.emit({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 10, retry_delay_ms: 500, error_status: null, error: "unknown" });
    q.fail(new Error("Claude Code process exited with code 1"));
  };
  const rec = recorder();
  const offline = await provider(fake).run(turnParams(), rec.cb, signal());
  assert.equal(offline.status, "failed");
  assert.equal(offline.network, true);
  assert.equal(rec.retries[0]?.attempt, 1);

  const resetsAt = 1_900_000_000;
  fake.onQuery = (q) => {
    q.emit({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt } });
    q.fail(new Error("Claude Code process exited with code 1"));
  };
  const limited = await provider(fake).run(turnParams(), recorder().cb, signal());
  assert.equal(limited.status, "failed");
  assert.equal(limited.network, false);
  assert.deepEqual(limited.usageLimit, { resetsAt: new Date(resetsAt * 1000).toISOString() });
});

test("鍵を載せない: AI の操作ツールの口は initialize で渡し、鍵は起動の引数・環境変数に出ない。API キーの設定がなければ環境変数にキーがない", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-from-shell");
  vi.stubEnv("KICKOFF_ALLOW_API_KEY", undefined);
  const fake = fakeClaudeSdk();
  const tools = [{ name: "kickoff_chat", url: "http://127.0.0.1:9/mcp/kickoff_chat", headers: { Authorization: "Bearer secret-key" }, autoAllow: ["list_family_chats"] }];
  await provider(fake).run(turnParams({ tools }), recorder().cb, signal());
  const { options } = fake.queries[0];
  assert.equal(options.mcpServersDelivery, "initialize");
  assert.deepEqual(options.mcpServers, { kickoff_chat: { type: "http", url: tools[0].url, headers: { Authorization: "Bearer secret-key" } } });
  assert.ok(options.allowedTools?.includes("mcp__kickoff_chat__list_family_chats"));
  assert.ok(!JSON.stringify([options.extraArgs ?? {}, options.executableArgs ?? [], options.env ?? {}]).includes("secret-key"));
  assert.equal(options.env?.ANTHROPIC_API_KEY, undefined);
});

test("圧縮: 区切りの post_tokens を作業の終わりを待たずに context で知らせ、圧縮前指示があるときだけ PreCompact のフックを入れる", async () => {
  const fake = fakeClaudeSdk();
  fake.onQuery = (q) => {
    q.emit({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 180_000, post_tokens: 20_000 } });
    q.finish();
  };
  const rec = recorder();
  const result = await provider(fake).run(turnParams({ preCompact: { message: "まとめて", contextWindow: 200_000, contextTokens: null } }), rec.cb, signal());
  assert.deepEqual(rec.contexts, [20_000]);
  assert.ok(rec.events.some((e) => e.type === "compact"));
  assert.equal(result.context?.tokens, 20_000);
  assert.equal(fake.queries[0].options.hooks?.PreCompact?.length, 1);

  await provider(fake).run(turnParams(), recorder().cb, signal());
  assert.equal(fake.queries[1].options.hooks?.PreCompact, undefined);
});

test("文脈: turnContext があると UserPromptSubmit のフックが 1 回だけ additionalContext を返す", async () => {
  const fake = fakeClaudeSdk();
  const outputs: unknown[][] = [];
  fake.onQuery = async (q) => {
    outputs.push(await q.hook("UserPromptSubmit", { prompt: "やって" }));
    outputs.push(await q.hook("UserPromptSubmit", { prompt: "追加の指示" }));
    q.finish();
  };
  await provider(fake).run(turnParams({ turnContext: "親チャット: 設計" }), recorder().cb, signal());
  assert.deepEqual(outputs, [[{ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "親チャット: 設計" } }], [{}]]);

  fake.onQuery = (q) => q.finish();
  await provider(fake).run(turnParams(), recorder().cb, signal());
  assert.equal(fake.queries[1].options.hooks?.UserPromptSubmit, undefined);
});

test("分岐: fork は forkSession を upToMessageId 付きで呼び、新しいセッションを返す", async () => {
  // 会話記録の置き場を空にする（切り出す元が見つからず、作業フォルダを付けて丸ごと写す道を通る）
  vi.stubEnv("CLAUDE_CONFIG_DIR", tempDir());
  const fake = fakeClaudeSdk();
  assert.equal(await provider(fake).fork("s-1", "m-9", "/w"), "forked-1");
  assert.deepEqual(fake.forks, [{ sessionId: "s-1", dir: "/w", upToMessageId: "m-9" }]);
});

test("1 回だけ聞く: 軽い = haiku・ふつう = sonnet を model に渡し、会話記録を残さず、終わったら閉じる", async () => {
  const fake = fakeClaudeSdk();
  const p = provider(fake);
  assert.equal(await p.ask("質問", { model: "light" }), "ok");
  assert.equal(await p.ask("質問", { model: "standard" }), "ok");
  assert.deepEqual(
    fake.queries.map((q) => q.options.model),
    ["haiku", "sonnet"],
  );
  const [q] = fake.queries;
  assert.equal(q.received[0].message.content, "質問");
  assert.equal(q.options.persistSession, false);
  assert.equal(q.closed, true);
});
