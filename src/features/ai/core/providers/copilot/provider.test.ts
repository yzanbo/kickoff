// GitHub Copilot のプロバイダーを偽の SDK のクライアントで確かめる（本物のランタイム・アカウントは使わない）
import { test } from "vitest";
import assert from "node:assert/strict";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import { fakeCopilotClient, type FakeCopilotSession } from "@/features/ai/core/testing/fakeCopilotClient";
import { until } from "@/app/core/testing/testCore";
import type { ApprovalRequest, ProviderCallbacks, ProviderTurnParams, TurnControl } from "@/features/ai/core/providers/types";
import type { SessionConfig } from "./sdk";
import { CopilotProvider } from "./provider";
import { experimentalProviders } from "@/features/ai/core/providers/index";

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
    additionalDirectories: ["/uploads"],
    env: { GH_TOKEN: "gho_project", PORT: "20100" },
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

const configOf = (s: FakeCopilotSession) => s.config as SessionConfig;
const permit = (s: FakeCopilotSession, req: Record<string, unknown>) => configOf(s).onPermissionRequest!(req as never, { sessionId: s.sessionId });

test("実行: セッションを作って送り、返答・コマンドを Claude Code と同じ形の記録にして、最後の記録のイベントを分岐の起点に返す", async () => {
  const fake = fakeCopilotClient();
  let lastPersisted = "";
  fake.onSend = (s) => {
    s.emit("user.message", { content: "やって" });
    s.emit("tool.execution_start", { toolCallId: "t1", toolName: "bash", arguments: { command: "ls" } });
    s.emit("tool.execution_complete", { toolCallId: "t1", success: true, result: { content: "a.ts\n" } });
    s.emit("tool.execution_start", { toolCallId: "t2", toolName: "kickoff_chat-list_family_chats", mcpServerName: "kickoff_chat", mcpToolName: "list_family_chats", arguments: {} });
    s.emit("tool.execution_complete", { toolCallId: "t2", success: true, result: { content: "[]" } });
    s.emit("assistant.message_delta", { deltaContent: "でき", messageId: "m1" }, { ephemeral: true });
    lastPersisted = s.emit("assistant.message", { content: "できました", messageId: "m1" });
    s.emit("session.usage_info", { currentTokens: 30, tokenLimit: 200, messagesLength: 3 }, { ephemeral: true });
    s.idle();
  };
  const rec = recorder();
  const result = await new CopilotProvider({ clientFactory: fake.factory, env: { PATH: "/bin", GITHUB_TOKEN: "ghp_env" } }).run(params(), rec.cb, new AbortController().signal);
  assert.deepEqual(result, { status: "completed", sessionId: fake.sessions[0].sessionId, result: "できました", lastMessageId: lastPersisted, context: { tokens: 30, window: 200 } });
  assert.deepEqual(
    rec.events.map((e) => e.type),
    ["init", "tool_use", "tool_result", "tool_use", "tool_result", "text"],
  );
  assert.deepEqual(rec.events[1], { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } });
  assert.equal(rec.events[3].name, "mcp__kickoff_chat__list_family_chats");
  assert.deepEqual(rec.streamed, ["でき"]);
  // セッションの設定: すべて聞く・システムプロンプトに足す・MCP は鍵の見出しと長い待ち時間（環境変数には載せない）
  const config = configOf(fake.sessions[0]);
  assert.equal(config.permissionMode, "manual");
  assert.deepEqual(config.systemMessage, { content: "Kickoff の文脈" });
  assert.deepEqual(config.additionalDirectories, ["/uploads"]);
  assert.deepEqual(config.mcpServers?.kickoff_chat, { type: "http", url: "http://127.0.0.1:9/mcp/kickoff_chat", headers: { Authorization: "Bearer secret-key" }, tools: ["*"], timeout: 7 * 24 * 60 * 60 * 1000 });
  // ランタイムの環境: Copilot のログインを置き換える GitHub のトークンは外し、ほかは渡す
  const env = fake.clients[0].env;
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.PORT, "20100");
  assert.ok(!JSON.stringify(env).includes("secret-key"));
  assert.ok(fake.sessions[0].disconnected && fake.clients[0].stopped);
});

test("続き: セッション ID のセッションを resume してから送る。指示に添える文脈は先の段落に", async () => {
  const fake = fakeCopilotClient();
  const result = await new CopilotProvider({ clientFactory: fake.factory }).run(params({ resumeSessionId: "s-old", turnContext: "親は A" }), recorder().cb, new AbortController().signal);
  assert.equal(result.sessionId, "s-old");
  assert.ok(fake.sessions[0].resumed);
  assert.equal(fake.sessions[0].sent[0].prompt, "親は A\n\nやって");
});

test("承認と守り: 消すコマンドは聞かずに断って理由を AI に返し、ほかは毎回確認なら承認カードで聞く。計画モードは断り、Auto mode は通す", async () => {
  const fake = fakeCopilotClient();
  const answers: unknown[] = [];
  fake.onSend = async (s) => {
    s.emit("user.message", { content: "x" });
    answers.push(await permit(s, { kind: "shell", fullCommandText: "rm -rf build", intention: "消す", toolCallId: "c1" }));
    answers.push(await permit(s, { kind: "shell", fullCommandText: "npm install", intention: "入れる", toolCallId: "c2" }));
    answers.push(await permit(s, { kind: "read", path: "/w/a.ts", intention: "読む" }));
    answers.push(await permit(s, { kind: "mcp", serverName: "kickoff_chat", toolName: "list_family_chats", toolTitle: "一覧", readOnly: true }));
    s.idle();
  };
  const rec = recorder(() => ({ action: "deny", message: "今はやめて" }));
  await new CopilotProvider({ clientFactory: fake.factory }).run(params({ deleteGuard: true }), rec.cb, new AbortController().signal);
  assert.equal((answers[0] as any).kind, "reject");
  assert.match((answers[0] as any).feedback, /kickoff-trash/);
  assert.equal((answers[1] as any).kind, "reject");
  assert.match((answers[1] as any).feedback, /今はやめて/);
  assert.deepEqual(answers.slice(2), [{ kind: "approve-once" }, { kind: "approve-once" }]);
  assert.equal(rec.approvals.length, 1);
  assert.deepEqual(rec.approvals[0].input, { command: "npm install" });

  // 計画モードはコマンドもファイルの変更も断り、Auto mode は通す（「常に許可」はこのセッションの間）
  for (const [mode, expected] of [
    ["plan", "reject"],
    ["auto", "approve-once"],
  ] as const) {
    const f = fakeCopilotClient();
    const got: any[] = [];
    f.onSend = async (s) => {
      got.push(await permit(s, { kind: "write", fileName: "/w/a.ts", diff: "+x", intention: "書く", canOfferSessionApproval: true }));
      s.idle();
    };
    await new CopilotProvider({ clientFactory: f.factory }).run(params({ permissionMode: mode }), recorder().cb, new AbortController().signal);
    assert.equal(got[0].kind, expected);
  }
  const always = fakeCopilotClient();
  const got: any[] = [];
  always.onSend = async (s) => {
    got.push(await permit(s, { kind: "shell", fullCommandText: "make", intention: "", toolCallId: "c3" }));
    s.idle();
  };
  await new CopilotProvider({ clientFactory: always.factory }).run(params(), recorder(() => ({ action: "allow_always" })).cb, new AbortController().signal);
  assert.deepEqual(got, [{ kind: "approve-for-session" }]);
});

test("ツールの前のフック: 承認を通らないコマンドでも、断る守り（消すコマンド）は効く", async () => {
  const fake = fakeCopilotClient();
  const out: unknown[] = [];
  fake.onSend = async (s) => {
    const hook = configOf(s).hooks!.onPreToolUse!;
    out.push(await hook({ toolName: "bash", toolArgs: { command: "rm -rf dist" }, sessionId: s.sessionId, timestamp: new Date(), workingDirectory: "/w" }, { sessionId: s.sessionId }));
    out.push(await hook({ toolName: "bash", toolArgs: { command: "ls" }, sessionId: s.sessionId, timestamp: new Date(), workingDirectory: "/w" }, { sessionId: s.sessionId }));
    s.idle();
  };
  await new CopilotProvider({ clientFactory: fake.factory }).run(params({ deleteGuard: true }), recorder().cb, new AbortController().signal);
  assert.equal((out[0] as any).permissionDecision, "deny");
  assert.match((out[0] as any).permissionDecisionReason, /kickoff-trash/);
  assert.equal(out[1], undefined);
});

test("止める・作業中に足す: tell は immediate で送り、止めたら abort して中断で返す", async () => {
  const fake = fakeCopilotClient();
  fake.onSend = (s, _prompt, mode) => {
    if (mode !== "immediate") s.emit("user.message", { content: "x" });
  };
  const rec = recorder();
  const ac = new AbortController();
  const running = new CopilotProvider({ clientFactory: fake.factory }).run(params(), rec.cb, ac.signal);
  await until(() => rec.control() !== null);
  assert.equal(rec.control()!.tell("あとこれも"), true);
  assert.deepEqual(fake.sessions[0].sent[1], { prompt: "あとこれも", mode: "immediate" });
  ac.abort();
  const result = await running;
  assert.equal(result.status, "cancelled");
  assert.ok(fake.sessions[0].aborted);
});

test("起動の途中（ランタイムの起動を待つ間）に止めると、送らずに中断で返す", async () => {
  const fake = fakeCopilotClient();
  const ac = new AbortController();
  const factory: typeof fake.factory = (opts) => {
    const client = fake.factory(opts);
    return {
      ...client,
      start: async () => {
        ac.abort();
        await client.start();
      },
    };
  };
  const result = await new CopilotProvider({ clientFactory: factory }).run(params(), recorder().cb, ac.signal);
  assert.equal(result.status, "cancelled");
  assert.deepEqual(fake.sessions[0].sent, []);
});

test("失敗: 使用枠の上限は usageLimit、通信の切断は network にする", async () => {
  for (const [error, key] of [
    [{ errorType: "rate_limit", message: "user_weekly_rate_limited" }, "usageLimit"],
    [{ errorType: "query", message: "fetch failed: ECONNRESET" }, "network"],
  ] as const) {
    const fake = fakeCopilotClient();
    fake.onSend = (s) => {
      s.emit("session.error", error);
      s.idle();
    };
    const result = await new CopilotProvider({ clientFactory: fake.factory }).run(params(), recorder().cb, new AbortController().signal);
    assert.equal(result.status, "failed");
    assert.ok(key in result, `${key} が付く`);
  }
});

test("API キー（BYOK）: キーの頭で種類を決めてセッションの設定で渡し（環境変数には載せない）、モデルを選んでいなければ種類の既定", async () => {
  const fake = fakeCopilotClient();
  await new CopilotProvider({ clientFactory: fake.factory }).run(params({ auth: { mode: "api_key", apiKey: "sk-ant-key" } }), recorder().cb, new AbortController().signal);
  const config = configOf(fake.sessions[0]);
  assert.deepEqual(config.provider, { type: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "sk-ant-key" });
  assert.ok(config.model);
  assert.ok(!JSON.stringify(fake.clients[0].env).includes("sk-ant-key"));
  // サブスクならつなぎ先を渡さない
  const sub = fakeCopilotClient();
  await new CopilotProvider({ clientFactory: sub.factory }).run(params(), recorder().cb, new AbortController().signal);
  assert.equal(configOf(sub.sessions[0]).provider, undefined);
});

test("分岐: 起点のイベントの次のイベントを境目にして sessions.fork する（境目はその手前まで）", async () => {
  const fake = fakeCopilotClient();
  fake.history.set("s-1", [
    { id: "a", type: "user.message" },
    { id: "b", type: "assistant.message" },
    { id: "c", type: "user.message" },
  ]);
  const provider = new CopilotProvider({ clientFactory: fake.factory });
  assert.equal(await provider.fork("s-1", "b", "/w"), "fork-of-s-1");
  assert.deepEqual(fake.forks[0], { sessionId: "s-1", toEventId: "c" });
  await provider.fork("s-1", "c", "/w");
  assert.deepEqual(fake.forks[1], { sessionId: "s-1", toEventId: undefined });
  await assert.rejects(provider.fork("s-1", "zzz", "/w"));
});

test("1 回だけ聞く: ツールなしの一時のセッションで、light はいちばん安いモデル", async () => {
  const fake = fakeCopilotClient();
  fake.models = [
    { id: "big", name: "Big", capabilities: { supports: { vision: false, reasoningEffort: false }, limits: { max_context_window_tokens: 1 } }, billing: { multiplier: 1 } },
    { id: "mini", name: "Mini", capabilities: { supports: { vision: false, reasoningEffort: false }, limits: { max_context_window_tokens: 1 } }, billing: { multiplier: 0 } },
  ];
  fake.onSend = (s) => {
    s.emit("assistant.message", { content: " 名前 ", messageId: "m" });
    s.idle();
  };
  const provider = new CopilotProvider({ clientFactory: fake.factory });
  assert.equal(await provider.ask("名前を付けて"), "名前");
  const config = configOf(fake.sessions[0]);
  assert.equal(config.model, "mini");
  assert.deepEqual(config.availableTools, []);
  await provider.ask("書き直して", { model: "standard" });
  assert.equal(configOf(fake.sessions[1]).model, "big");
});

test("手で圧縮: /compact は history.compact を呼び、要約の記録を残す。会話がなければ失敗", async () => {
  const fake = fakeCopilotClient();
  const rec = recorder();
  const result = await new CopilotProvider({ clientFactory: fake.factory }).run(params({ prompt: "/compact", compact: true, resumeSessionId: "s-1" }), rec.cb, new AbortController().signal);
  assert.equal(result.status, "completed");
  assert.ok(rec.events.some((e) => e.type === "compact" && e.trigger === "manual"));
  const none = await new CopilotProvider({ clientFactory: fake.factory }).run(params({ prompt: "/compact", compact: true }), recorder().cb, new AbortController().signal);
  assert.equal(none.status, "failed");
});

test("状態: ログインの様子", async () => {
  const fake = fakeCopilotClient();
  const provider = new CopilotProvider({ clientFactory: fake.factory });
  const status = await provider.status();
  assert.equal(status.logged_in, true);
  assert.equal(status.account, "octo");
});

test("開発用の環境変数で copilot を選んだときだけ本物の実装を使う", () => {
  assert.ok(experimentalProviders({ KICKOFF_EXPERIMENTAL_PROVIDERS: "codex, copilot" }).has("copilot"));
  assert.ok(!experimentalProviders({}).has("copilot"));
});
