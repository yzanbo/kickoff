// Codex のプロバイダーを偽の app-server で確かめる（本物の codex・アカウントは使わない）
import { test } from "vitest";
import { withGate, type TestGuardMaterials } from "@/app/core/testing/testGate";
import assert from "node:assert/strict";
import { fakeCodexServer, type FakeCodexServer } from "@/features/ai/core/testing/fakeStdioServer";
import { until } from "@/app/core/testing/testCore";
import type { AgentProvider, ProviderCallbacks, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { chatToolEndpoint, recorder, turnParams } from "@/features/ai/core/providers/testing/contract";
import { HOOK_INACTIVE } from "./hookTrust";
import { CodexProvider } from "./provider";
import { experimentalProviders } from "@/features/ai/core/providers/index";

/** 本物の守りの門を付けて動かす（門の承認カードも同じ cb で聞く） */
const guardedRun = (provider: AgentProvider, p: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal, materials: TestGuardMaterials = {}) =>
  provider.run(withGate(p, cb.requestApproval, signal, materials), cb, signal);

/** このプロバイダーの確かめの実行の指定（AI の操作ツールの口を渡す） */
const params = (extra: Partial<ProviderTurnParams> = {}) => turnParams({ tools: [chatToolEndpoint()], ...extra });

/** turn/start のあとに台本を流す（終わりは turn/completed） */
function onTurn(server: FakeCodexServer, script: (s: FakeCodexServer) => Promise<void> | void) {
  server.handle("turn/start", (_p, s) => {
    setImmediate(() => void Promise.resolve(script(s)));
    return { turn: { id: "turn-1", status: "inProgress", error: null } };
  });
}
const complete = (s: FakeCodexServer, status = "completed") => s.notify("turn/completed", { threadId: "thr-1", turn: { id: "turn-1", status, error: null } });

test("診断に知らせる PID は、この実行で起動した app-server のもの", async () => {
  const server = fakeCodexServer();
  onTurn(server, (s) => complete(s));
  const pids: number[] = [];
  const spawn: typeof server.spawn = (args, opts) => ({ ...server.spawn(args, opts), pid: 321 });
  const result = await guardedRun(new CodexProvider({ spawn }), params({ onAgentSpawned: (pid) => pids.push(pid) }), recorder().cb, new AbortController().signal);
  assert.equal(result.status, "completed");
  assert.deepEqual(pids, [321]);
});

test("実行: スレッドを作って指示を送り、返答・コマンドを Claude Code と同じ形の記録にして、ターンの ID を分岐の起点に返す", async () => {
  const server = fakeCodexServer();
  onTurn(server, (s) => {
    s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } });
    s.notify("item/started", { threadId: "thr-1", turnId: "turn-1", item: { type: "commandExecution", id: "c1", command: "ls", cwd: "/w", aggregatedOutput: null, exitCode: null, status: "inProgress" } });
    s.notify("item/completed", { threadId: "thr-1", turnId: "turn-1", item: { type: "commandExecution", id: "c1", command: "ls", cwd: "/w", aggregatedOutput: "a.ts\n", exitCode: 0, status: "completed" } });
    s.notify("item/agentMessage/delta", { threadId: "thr-1", turnId: "turn-1", itemId: "m1", delta: "でき" });
    s.notify("item/completed", { threadId: "thr-1", turnId: "turn-1", item: { type: "agentMessage", id: "m1", text: "できました" } });
    s.notify("thread/tokenUsage/updated", { threadId: "thr-1", turnId: "turn-1", tokenUsage: { total: { totalTokens: 50, inputTokens: 0, outputTokens: 0 }, last: { totalTokens: 30, inputTokens: 0, outputTokens: 0 }, modelContextWindow: 200 } });
    complete(s);
  });
  const rec = recorder();
  const result = await new CodexProvider({ spawn: server.spawn, env: { PATH: "/bin", OPENAI_API_KEY: "x" } }).run(params(), rec.cb, new AbortController().signal);
  assert.deepEqual(result, { status: "completed", sessionId: "thr-1", result: "できました", lastMessageId: "turn-1", context: { tokens: 30, window: 200 } });
  assert.deepEqual(rec.events[1], { type: "tool_use", id: "c1", name: "Bash", input: { command: "ls" } });
  assert.deepEqual(rec.streamed, ["でき"]);
  // スレッドの上書き: 承認は on-request、守りのフックを信頼した覚えごと渡す、MCP は鍵の見出し付き（起動の引数・環境変数には載せない）
  const start = server.requests.find((r) => r.method === "thread/start" && !r.params.ephemeral)!.params;
  assert.equal(start.approvalPolicy, "on-request");
  assert.ok(start.config["hooks.PreToolUse"]);
  assert.deepEqual(Object.values(start.config["hooks.state"]), [{ trusted_hash: "sha256:fake" }]);
  assert.equal(start.developerInstructions, "Kickoff の文脈");
  assert.deepEqual(start.config["mcp_servers.kickoff_chat"].http_headers, { Authorization: "Bearer secret-key" });
  assert.equal(server.spawned[0].env.OPENAI_API_KEY, undefined);
  assert.equal(server.requests.find((r) => r.method === "turn/start")!.params.clientUserMessageId, "u-1");
  assert.ok(server.killed > 0);
});

test("実行中の使用枠の知らせ（スレッドの ID がない）から、クレジットの様子を渡す", async () => {
  const server = fakeCodexServer();
  onTurn(server, (s) => {
    s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } });
    s.notify("account/rateLimits/updated", { rateLimits: { primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: null }, secondary: null, planType: null, credits: { hasCredits: true, unlimited: false, balance: "142" } } });
    complete(s);
  });
  const notes: unknown[] = [];
  const rec = recorder();
  await guardedRun(new CodexProvider({ spawn: server.spawn }), params(), { ...rec.cb, spending: (note) => notes.push(note) }, new AbortController().signal);
  assert.deepEqual(notes, [{ has_credits: true, unlimited: false, balance: 142, limit_reached: true }]);
});

test("守りのフックが信頼済みにならなければ、作業を始めずに失敗で返す（守りなしで動かさない）", async () => {
  const server = fakeCodexServer();
  server.handle("hooks/list", () => ({ data: [{ cwd: "/w", hooks: [], warnings: [], errors: [] }] }));
  const result = await guardedRun(new CodexProvider({ spawn: server.spawn }), params(), recorder().cb, new AbortController().signal);
  assert.equal(result.status, "failed");
  assert.equal(result.error, HOOK_INACTIVE);
  assert.ok(!server.requests.some((r) => r.method === "turn/start"));
});

test("続き: resume したスレッドに新しいスレッドを作らずに送り、そのターンの ID を返す", async () => {
  const server = fakeCodexServer();
  server.handle("turn/start", (p, s) => {
    setImmediate(() => s.notify("turn/completed", { threadId: p.threadId, turn: { id: "turn-9", status: "completed", error: null } }));
    return { turn: { id: "turn-9", status: "inProgress", error: null } };
  });
  const result = await guardedRun(new CodexProvider({ spawn: server.spawn }), params({ resumeSessionId: "thr-old" }), recorder().cb, new AbortController().signal);
  assert.equal(result.lastMessageId, "turn-9");
  assert.ok(!server.requests.some((r) => r.method === "thread/start" && !r.params.ephemeral));
});

test("resume が対象セッションの消失を明示したとき、指示を送らず区別できる結果を返す", async () => {
  const server = fakeCodexServer();
  const id = "00000000-0000-4000-8000-000000000000";
  server.handle("thread/resume", () => { throw Object.assign(new Error(`no rollout found for thread id ${id}`), { code: -32600 }); });
  const result = await guardedRun(new CodexProvider({ spawn: server.spawn }), params({ resumeSessionId: id }), recorder().cb, new AbortController().signal);
  assert.equal(result.status, "failed");
  assert.equal(result.resumeSessionMissing, true);
  assert.equal(result.sessionId, id);
  assert.equal(server.requests.some((request) => request.method === "turn/start"), false);
});

test("断った理由: 守りの理由も承認カードで断った理由も turn/steer で伝える（承認の答えは decline）", async () => {
  const server = fakeCodexServer();
  const answers: unknown[] = [];
  onTurn(server, async (s) => {
    s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } });
    answers.push(await s.request("item/commandExecution/requestApproval", { threadId: "thr-1", turnId: "turn-1", itemId: "c1", command: "rm -rf build" }));
    answers.push(await s.request("item/commandExecution/requestApproval", { threadId: "thr-1", turnId: "turn-1", itemId: "c2", command: "npm install" }));
    complete(s);
  });
  const rec = recorder(() => ({ action: "deny", message: "今はやめて" }));
  await guardedRun(new CodexProvider({ spawn: server.spawn }), params(), rec.cb, new AbortController().signal, { deleteGuard: true });
  assert.deepEqual(answers, [{ decision: "decline" }, { decision: "decline" }]);
  assert.equal(rec.approvals.length, 1);
  assert.deepEqual(rec.approvals[0].input, { command: "npm install" });
  const steers = server.requests.filter((r) => r.method === "turn/steer").map((r) => r.params.input[0].text as string);
  assert.equal(steers.length, 2);
  assert.match(steers[0], /kickoff-trash/);
  assert.match(steers[1], /今はやめて/);
});

test("書き込み先: 作業場所の外のファイルは Auto mode でも聞き、「常に許可」はこのチャットの間だけ覚える", async () => {
  const server = fakeCodexServer();
  let answer: unknown;
  onTurn(server, async (s) => {
    s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } });
    s.notify("item/started", { threadId: "thr-1", turnId: "turn-1", item: { type: "fileChange", id: "f1", status: "inProgress", changes: [{ path: "/elsewhere/a.txt", kind: { type: "add" }, diff: "+x" }] } });
    answer = await s.request("item/fileChange/requestApproval", { threadId: "thr-1", turnId: "turn-1", itemId: "f1" });
    complete(s);
  });
  const allowed = new Set<string>();
  const rec = recorder(() => ({ action: "allow_always" }));
  await guardedRun(new CodexProvider({ spawn: server.spawn }), 
    params({ permissionMode: "auto", cwd: "/w" }),
    rec.cb,
    new AbortController().signal,
    { writeScope: { writableDirs: [], workplaces: async () => [], allowed } },
  );
  assert.deepEqual(answer, { decision: "accept" });
  assert.equal(rec.approvals.length, 1);
  assert.equal(rec.approvals[0].rememberScope, "chat");
  assert.equal(allowed.size, 1);
});

test("AI からの質問: 質問カードに写し、答えを質問の ID ごとに返す", async () => {
  const server = fakeCodexServer();
  let answer: any;
  onTurn(server, async (s) => {
    answer = await s.request("item/tool/requestUserInput", {
      threadId: "thr-1",
      turnId: "turn-1",
      itemId: "q1",
      questions: [{ id: "lang", header: "言語", question: "どれで書く？", isOther: false, isSecret: false, options: [{ label: "TS", description: "" }] }],
    });
    complete(s);
  });
  const rec = recorder(() => ({ action: "answer", answers: { "どれで書く？": "TS" } }));
  await guardedRun(new CodexProvider({ spawn: server.spawn }), params(), rec.cb, new AbortController().signal);
  assert.equal(rec.approvals[0].kind, "question");
  assert.deepEqual(answer, { answers: { lang: { answers: ["TS"] } } });
});

test("作業中に足す発言はいまのターンの ID を付けた turn/steer、止めるのは turn/interrupt", async () => {
  const server = fakeCodexServer();
  onTurn(server, (s) => s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } }));
  server.handle("turn/interrupt", (_p, s) => {
    setImmediate(() => complete(s, "interrupted"));
    return {};
  });
  const rec = recorder();
  const ac = new AbortController();
  const running = guardedRun(new CodexProvider({ spawn: server.spawn }), params(), rec.cb, ac.signal);
  // 操作の口はターンが始まってから渡る（そのときにはターンの ID が分かっている）
  await until(() => rec.control() !== null);
  assert.equal(rec.control()!.tell("これも", "u-2"), true);
  const steer = await server.waitFor("turn/steer");
  assert.equal(steer.input[0].text, "これも");
  assert.equal(steer.expectedTurnId, "turn-1");
  ac.abort();
  await running;
  assert.ok(server.requests.some((r) => r.method === "turn/interrupt"));
});

test("起動の途中（initialize の答えを待つ間）に止めると、ターンを始めずに中断で返す", async () => {
  const server = fakeCodexServer();
  const ac = new AbortController();
  server.handle("initialize", () => {
    ac.abort();
    return { userAgent: "fake" };
  });
  const result = await guardedRun(new CodexProvider({ spawn: server.spawn }), params(), recorder().cb, ac.signal);
  assert.equal(result.status, "cancelled");
  assert.ok(!server.requests.some((r) => r.method === "turn/start"));
});

test("API キー: 起動の環境変数で渡し、引数・スレッドの上書きには載せない", async () => {
  const server = fakeCodexServer();
  onTurn(server, complete);
  await guardedRun(new CodexProvider({ spawn: server.spawn }), params({ auth: { mode: "api_key", apiKey: "sk-test" } }), recorder().cb, new AbortController().signal);
  assert.equal(server.spawned[0].env.CODEX_API_KEY, "sk-test");
  assert.ok(!server.spawned[0].args.join(" ").includes("sk-test"));
  assert.ok(!JSON.stringify(server.requests).includes("sk-test"));
});

test("分岐は thread/fork（ターンの ID まで）、手で圧縮は thread/compact/start", async () => {
  const server = fakeCodexServer();
  server.handle("thread/fork", () => ({ thread: { id: "thr-fork" }, model: "gpt-fake" }));
  const provider = new CodexProvider({ spawn: server.spawn });
  assert.equal(await provider.fork("thr-1", "turn-3", "/w"), "thr-fork");
  assert.deepEqual(server.requests.find((r) => r.method === "thread/fork")!.params, { threadId: "thr-1", lastTurnId: "turn-3", cwd: "/w", excludeTurns: true });

  server.handle("thread/compact/start", (p, s) => {
    setImmediate(() => {
      s.notify("item/started", { threadId: p.threadId, turnId: "tc", item: { type: "contextCompaction", id: "k1" } });
      s.notify("item/completed", { threadId: p.threadId, turnId: "tc", item: { type: "contextCompaction", id: "k1" } });
    });
    return {};
  });
  const rec = recorder();
  const result = await provider.run(params({ prompt: "/compact", compact: true, resumeSessionId: "thr-1" }), rec.cb, new AbortController().signal);
  assert.equal(result.status, "completed");
  assert.equal(rec.events.find((e) => e.type === "compact")?.trigger, "manual");
  assert.ok(!server.requests.some((r) => r.method === "turn/start"));
});

test("Sign in with ChatGPT の骨組み: ログインの URL を返し、account/login/completed で終わる", async () => {
  const server = fakeCodexServer();
  server.handle("account/login/start", (p, s) => {
    assert.deepEqual(p, { type: "chatgpt" });
    setImmediate(() => s.notify("account/login/completed", { loginId: "L1", success: true, error: null }));
    return { type: "chatgpt", loginId: "L1", authUrl: "https://auth.example/login" };
  });
  const login = await new CodexProvider({ spawn: server.spawn }).login();
  assert.equal(login.authUrl, "https://auth.example/login");
  assert.equal(await login.completed, true);
  await until(() => server.killed > 0);
});

test("開発用の環境変数は , 区切りの ID の集まりとして読む（Codex はいつも本物なので使わない）", () => {
  assert.deepEqual([...experimentalProviders({})], []);
  assert.deepEqual([...experimentalProviders({ KICKOFF_EXPERIMENTAL_PROVIDERS: "copilot, cursor" })], ["copilot", "cursor"]);
});

test("作業中に足した発言の turn/steer が断られたら、届かなかったことを知らせに残す（記録だけ残って AI に届かないままにしない）", async () => {
  const server = fakeCodexServer();
  onTurn(server, (s) => s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } }));
  server.handle("turn/steer", () => {
    throw new Error("turn already finished");
  });
  const rec = recorder();
  const ac = new AbortController();
  const running = guardedRun(new CodexProvider({ spawn: server.spawn }), params(), rec.cb, ac.signal);
  await until(() => rec.control() !== null);
  assert.equal(rec.control()!.tell("これも", "u-2"), true);
  await until(() => rec.events.some((e) => e.type === "notice"));
  assert.match(rec.events.find((e) => e.type === "notice").message, /届けられませんでした.*turn already finished/);
  ac.abort();
  await running;
});
