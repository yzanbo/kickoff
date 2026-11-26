import { test } from "vitest";
import assert from "node:assert/strict";
import { z } from "zod";
import { AiToolRegistry } from "./registry";
import { defineAiTool, type AiToolGroup, type AiTurn } from "./tool";

/** 1 回の作業（聞いたら許可で答える。土台の testing はこのフォルダを読むので、ここに書く） */
function turnOf(chatId = 1): AiTurn {
  const values = new Map<string, unknown>();
  return {
    chatId,
    projectId: 1,
    provider: "claude",
    workdir: "/repo",
    signal: new AbortController().signal,
    ask: async () => ({ action: "allow" }),
    perTurn: <T>(key: string, init: () => T) => (values.has(key) ? values.get(key) : (values.set(key, init()), values.get(key))) as T,
  };
}

/** 名前を返すだけのツールを持つ組 */
const group = (server: AiToolGroup["server"], order: number, names: string[], extra: { auto?: boolean; readOnly?: boolean } = {}): AiToolGroup => ({
  server,
  order,
  instructions: [`${names.join("・")} の使い方`],
  open: () => names.map((name) => defineAiTool({ server, name, description: `${name} の説明`, input: {}, ...extra, run: () => name })),
});

test("レジストリ: サーバーは決まった順、組は order の順に並べ、使い方は頭の 1 文に続ける", () => {
  const registry = new AiToolRegistry([group("kickoff_chat", 20, ["b"]), group("kickoff_browser", 1, ["web"]), group("kickoff_chat", 10, ["a1", "a2"])]);
  const servers = registry.serversFor(turnOf(), { kickoff_chat: "頭の 1 文" });
  assert.deepEqual(servers.map((s) => s.name), ["kickoff_browser", "kickoff_chat"]);
  const chat = servers[1];
  assert.deepEqual(chat.tools.map((t) => t.name), ["a1", "a2", "b"]);
  assert.equal(chat.instructions, "頭の 1 文\na1・a2 の使い方\nb の使い方");
  assert.equal(servers[0].instructions, "web の使い方", "頭の文がなければ組の文だけ");
});

test("レジストリ: 聞かずに使わせる名前は auto のツールだけ、読むだけの印は readOnly のツールだけ", () => {
  const registry = new AiToolRegistry([group("kickoff_browser", 1, ["look"], { readOnly: true }), group("kickoff_browser", 2, ["click"], { auto: false })]);
  const [browser] = registry.serversFor(turnOf());
  assert.deepEqual(browser.autoAllow, ["look"]);
  assert.deepEqual(browser.tools.map((t) => t.annotations ?? null), [{ readOnlyHint: true }, null]);
});

test("レジストリ: open が null の組は出さず、出す組のないサーバーは渡さない", () => {
  const off: AiToolGroup = { server: "kickoff_db", order: 1, instructions: ["出さない"], open: () => null };
  const registry = new AiToolRegistry([off, group("kickoff_chat", 5, ["x"]), { ...off, server: "kickoff_chat", order: 1 }]);
  const servers = registry.serversFor(turnOf());
  assert.deepEqual(servers.map((s) => s.name), ["kickoff_chat"]);
  assert.equal(servers[0].instructions, "x の使い方");
  assert.deepEqual(new AiToolRegistry([off]).serversFor(turnOf()), []);
});

test("レジストリ: 使い方が関数の組は、出したときだけ作業ごとに呼んで文を作る", () => {
  const calls: number[] = [];
  const perTurnText: AiToolGroup = { ...group("kickoff_chat", 10, ["a"]), instructions: (turn) => (calls.push(turn.chatId), ["a の使い方", ...(turn.chatId === 2 ? ["2 だけの文"] : [])]) };
  const hidden: AiToolGroup = { ...perTurnText, order: 20, open: () => null };
  const registry = new AiToolRegistry([perTurnText, hidden, group("kickoff_chat", 30, ["b"])]);
  assert.equal(registry.serversFor(turnOf(1))[0].instructions, "a の使い方\nb の使い方");
  assert.equal(registry.serversFor(turnOf(2))[0].instructions, "a の使い方\n2 だけの文\nb の使い方");
  assert.deepEqual(calls, [1, 2], "出さない組の使い方は作らない");
});

test("レジストリ: 組は作業ごとに open するので、作業ごとの数えは分かれる。ツールには作業の文脈が渡る", async () => {
  const counting: AiToolGroup = {
    server: "kickoff_chat",
    order: 1,
    instructions: [],
    open(turn) {
      let calls = 0;
      return [defineAiTool({ server: "kickoff_chat", name: "count", description: "数える", input: {}, run: (_args, t) => `${t.chatId}:${++calls}:${turn === t}` })];
    },
  };
  const registry = new AiToolRegistry([counting]);
  const [first] = registry.serversFor(turnOf(7));
  await first.tools[0].handler({});
  assert.deepEqual((await first.tools[0].handler({})).content, [{ type: "text", text: "7:2:true" }]);
  const [second] = registry.serversFor(turnOf(8));
  assert.deepEqual((await second.tools[0].handler({})).content, [{ type: "text", text: "8:1:true" }]);
});

test("defineAiTool: 文・中身をそのまま結果にし、投げたら理由の文の失敗にする。出さないツールは available で外す", async () => {
  const tools: AiToolGroup = {
    server: "kickoff_chat",
    order: 1,
    instructions: [],
    open: () => [
      defineAiTool({ server: "kickoff_chat", name: "echo", description: "返す", input: { text: z.string() }, run: ({ text }) => [{ type: "text", text: `echo:${text}` }] }),
      defineAiTool({
        server: "kickoff_chat",
        name: "fail",
        description: "落ちる",
        input: {},
        run: async () => {
          throw new Error("できません");
        },
      }),
      defineAiTool({ server: "kickoff_chat", name: "hidden", description: "出さない", input: {}, available: (turn) => turn.chatId !== 1, run: () => "" }),
    ],
  };
  const [server] = new AiToolRegistry([tools]).serversFor(turnOf());
  assert.deepEqual(server.tools.map((t) => t.name), ["echo", "fail"]);
  assert.deepEqual(await server.tools[0].handler({ text: "hi" }), { content: [{ type: "text", text: "echo:hi" }] });
  assert.deepEqual(await server.tools[1].handler({}), { content: [{ type: "text", text: "できません" }], isError: true });
});
