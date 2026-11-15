// Codex のプロバイダーを偽の app-server で確かめる（本物の codex・アカウントは使わない。メモの仕様書「0021」の段階 3）
import { test } from "vitest";
import assert from "node:assert/strict";
import type { ApprovalDecision } from "@shared/types";
import { fakeCodexServer, type FakeCodexServer } from "../../testing/fakeStdioServer.js";
import { until } from "../../testing/testCore.js";
import type { ApprovalRequest, ProviderCallbacks, ProviderTurnParams, TurnControl } from "../types.js";
import { CodexProvider } from "./provider.js";
import { experimentalProviders } from "../index.js";

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
    tools: [{ name: "kickoff_chat", url: "http://127.0.0.1:9/mcp/kickoff_chat", headers: { Authorization: "Bearer secret-key" }, autoAllow: [] }],
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

/** turn/start のあとに台本を流す（終わりは turn/completed） */
function onTurn(server: FakeCodexServer, script: (s: FakeCodexServer) => Promise<void> | void) {
  server.handle("turn/start", (_p, s) => {
    setImmediate(() => void Promise.resolve(script(s)));
    return { turn: { id: "turn-1", status: "inProgress", error: null } };
  });
}
const complete = (s: FakeCodexServer, status = "completed") => s.notify("turn/completed", { threadId: "thr-1", turn: { id: "turn-1", status, error: null } });

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
  assert.deepEqual(
    rec.events.map((e) => e.type),
    ["init", "tool_use", "tool_result", "text"],
  );
  assert.deepEqual(rec.events[1], { type: "tool_use", id: "c1", name: "Bash", input: { command: "ls" } });
  assert.deepEqual(rec.streamed, ["でき"]);
  // スレッドの上書き: 承認は untrusted、MCP は鍵の見出し付き（起動の引数・環境変数には載せない）
  const start = server.requests.find((r) => r.method === "thread/start")!.params;
  assert.equal(start.approvalPolicy, "untrusted");
  assert.equal(start.developerInstructions, "Kickoff の文脈");
  assert.deepEqual(start.config["mcp_servers.kickoff_chat"].http_headers, { Authorization: "Bearer secret-key" });
  assert.ok(!JSON.stringify(server.spawned[0]).includes("secret-key"));
  assert.equal(server.spawned[0].env.OPENAI_API_KEY, undefined);
  assert.equal(server.requests.find((r) => r.method === "turn/start")!.params.clientUserMessageId, "u-1");
  assert.ok(server.killed > 0);
});

test("続き: セッション ID のスレッドを resume してから送る", async () => {
  const server = fakeCodexServer();
  server.handle("thread/resume", (p) => ({ thread: { id: p.threadId }, model: "gpt-fake" }));
  server.handle("turn/start", (p, s) => {
    setImmediate(() => s.notify("turn/completed", { threadId: p.threadId, turn: { id: "turn-9", status: "completed", error: null } }));
    return { turn: { id: "turn-9", status: "inProgress", error: null } };
  });
  const result = await new CodexProvider({ spawn: server.spawn }).run(params({ resumeSessionId: "thr-old" }), recorder().cb, new AbortController().signal);
  assert.equal(result.sessionId, "thr-old");
  assert.equal(result.lastMessageId, "turn-9");
  assert.ok(!server.requests.some((r) => r.method === "thread/start"));
});

test("承認と守り: 消すコマンドは聞かずに断り、理由を turn/steer で伝える。ほかは毎回確認なら承認カードで聞く", async () => {
  const server = fakeCodexServer();
  const answers: unknown[] = [];
  onTurn(server, async (s) => {
    s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } });
    answers.push(await s.request("item/commandExecution/requestApproval", { threadId: "thr-1", turnId: "turn-1", itemId: "c1", command: "rm -rf build" }));
    answers.push(await s.request("item/commandExecution/requestApproval", { threadId: "thr-1", turnId: "turn-1", itemId: "c2", command: "npm install" }));
    complete(s);
  });
  const rec = recorder(() => ({ action: "deny", message: "今はやめて" }));
  await new CodexProvider({ spawn: server.spawn }).run(params({ deleteGuard: true }), rec.cb, new AbortController().signal);
  assert.deepEqual(answers, [{ decision: "decline" }, { decision: "decline" }]);
  assert.equal(rec.approvals.length, 1);
  assert.deepEqual(rec.approvals[0].input, { command: "npm install" });
  const steers = server.requests.filter((r) => r.method === "turn/steer").map((r) => r.params.input[0].text as string);
  assert.equal(steers.length, 2);
  assert.match(steers[0], /kickoff-trash/);
  assert.match(steers[1], /今はやめて/);
});

test("承認と権限モード: Auto mode は守りが何も言わなければ通し、計画モードは変更を断る。作業場所の外のファイルは Auto mode でも聞く", async () => {
  for (const [mode, expected] of [
    ["auto", "accept"],
    ["plan", "decline"],
  ] as const) {
    const server = fakeCodexServer();
    let answer: unknown;
    onTurn(server, async (s) => {
      s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } });
      answer = await s.request("item/commandExecution/requestApproval", { threadId: "thr-1", turnId: "turn-1", itemId: "c1", command: "npm test" });
      complete(s);
    });
    const rec = recorder();
    await new CodexProvider({ spawn: server.spawn }).run(params({ permissionMode: mode }), rec.cb, new AbortController().signal);
    assert.deepEqual(answer, { decision: expected }, mode);
    assert.equal(rec.approvals.length, 0, mode);
  }

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
  await new CodexProvider({ spawn: server.spawn }).run(
    params({ permissionMode: "auto", cwd: "/w", writeScope: { writableDirs: [], workplaces: async () => [], allowed } }),
    rec.cb,
    new AbortController().signal,
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
  await new CodexProvider({ spawn: server.spawn }).run(params(), rec.cb, new AbortController().signal);
  assert.equal(rec.approvals[0].kind, "question");
  assert.deepEqual(answer, { answers: { lang: { answers: ["TS"] } } });
});

test("作業中に足す発言は turn/steer、止めると turn/interrupt で cancelled", async () => {
  const server = fakeCodexServer();
  onTurn(server, (s) => s.notify("turn/started", { threadId: "thr-1", turn: { id: "turn-1", status: "inProgress", error: null } }));
  server.handle("turn/interrupt", (_p, s) => {
    setImmediate(() => complete(s, "interrupted"));
    return {};
  });
  const rec = recorder();
  const ac = new AbortController();
  const running = new CodexProvider({ spawn: server.spawn }).run(params(), rec.cb, ac.signal);
  // 操作の口はターンが始まってから渡る（そのときにはターンの ID が分かっている）
  await until(() => rec.control() !== null);
  assert.equal(rec.control()!.tell("これも", "u-2"), true);
  const steer = await server.waitFor("turn/steer");
  assert.equal(steer.input[0].text, "これも");
  assert.equal(steer.expectedTurnId, "turn-1");
  ac.abort();
  const result = await running;
  assert.equal(result.status, "cancelled");
  assert.ok(server.requests.some((r) => r.method === "turn/interrupt"));
  assert.equal(rec.control(), null);
});

test("app-server が落ちたら失敗で返す", async () => {
  const server = fakeCodexServer();
  onTurn(server, (s) => s.crash(2));
  const result = await new CodexProvider({ spawn: server.spawn }).run(params(), recorder().cb, new AbortController().signal);
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /終了コード 2/);
});

test("API キー: 起動の環境変数で渡し、引数・スレッドの上書きには載せない", async () => {
  const server = fakeCodexServer();
  onTurn(server, complete);
  await new CodexProvider({ spawn: server.spawn }).run(params({ auth: { mode: "api_key", apiKey: "sk-test" } }), recorder().cb, new AbortController().signal);
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
  const result = await provider.run(params({ prompt: "/compact", resumeSessionId: "thr-1" }), rec.cb, new AbortController().signal);
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
  const login = await new CodexProvider({ spawn: server.spawn }).startLogin();
  assert.equal(login.authUrl, "https://auth.example/login");
  assert.equal(await login.completed, true);
  await until(() => server.killed > 0);
});

test("開発用の環境変数のときだけ Codex を使う（ほかは対応予定のまま）", () => {
  assert.deepEqual([...experimentalProviders({})], []);
  assert.deepEqual([...experimentalProviders({ KICKOFF_EXPERIMENTAL_PROVIDERS: "codex, cursor" })], ["codex", "cursor"]);
});
