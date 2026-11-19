// 開発版の DB に、確かめ用の長いチャットを作る（指示 n 回・1 回の作業に 6〜14 回のツール・表とコードブロックのある返答）。
// node scripts/perf/make-long-chat.mjs --turns 300 [--from 224] [--data <保存先のフォルダ>] [--fixture]
//   --from: 行の項目（プロジェクト・モデル・権限など）を写す元のチャット。開発版を止めていなくてよい（WAL）が、
//   作ったチャットは画面を読み込み直すと一覧に出る。製品版の DB には書かない（開発版の保存先だけを開く）。
//   --data: 開発版の保存先の代わりに書く保存先（AI の砂場は開発版の保存先に書けないので、写した DB と一時のコアで測るとき。
//   KICKOFF_DATA_DIR に同じフォルダを渡してコアを起動する。製品版の保存先は断る）
//   --fixture: 決まったデータの開発版（npm run dev:fixture）の保存先に、その長いチャットを元にして書く
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { FIXTURE, perfDefaults } from "../devtools/fixture.mjs";

/** 決まった種から作る乱数（何度作っても同じチャットになる） */
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const { values } = parseArgs({ options: { turns: { type: "string", default: "300" }, from: { type: "string", default: perfDefaults().chat }, title: { type: "string" }, data: { type: "string" }, fixture: { type: "boolean" } } });
const turns = Number(values.turns);
const dataDir = path.resolve(values.data ?? (values.fixture ? FIXTURE.dataDir : path.join(os.homedir(), "Library/Application Support/Kickoff Dev")));
if (dataDir === path.join(os.homedir(), "Library/Application Support/Kickoff")) throw new Error("製品版の保存先には書きません");
const db = new DatabaseSync(path.join(dataDir, "kickoff.db"));
db.exec("PRAGMA busy_timeout = 10000");
const src = db.prepare("SELECT * FROM chats WHERE id = ?").get(Number(values.from));
if (!src) throw new Error(`元のチャット ${values.from} がありません`);
const row = {
  ...src,
  title: values.title ?? `長いチャットの確かめ（${turns} 回）`,
  session_id: null,
  status: "completed",
  unread: 0,
  pinned: 0,
  parent_chat_id: null,
  parent_event_id: null,
  num_turns: turns,
  group_id: null,
  github_repo: null,
  github_number: null,
  github_kind: null,
  position: null,
};
delete row.id;
const cols = Object.keys(row);
const random = seeded(1);
const pick = (list) => list[Math.floor(random() * list.length)];
const code = Array.from({ length: 25 }, (_, i) => `  const v${i} = compute(items[${i}], options); // 計算 ${i}`).join("\n");
const md =
  "## 変更の要約\n\n" +
  "変更した内容を説明します。`useChatView` の中で **重い計算** をしていました。\n\n".repeat(3) +
  "| ファイル | 行 | 内容 |\n|---|---|---|\n" +
  Array.from({ length: 6 }, (_, i) => `| \`src/a${i}.ts\` | ${i * 10} | 直した |\n`).join("") +
  "\n```ts\nfunction sample() {\n" + code + "\n}\n```\n\n- 箇条書き 1\n- 箇条書き 2\n- 箇条書き 3\n";
const readOut = Array.from({ length: 60 }, (_, i) => `${i}\t${"x".repeat(60)}`).join("\n").slice(0, 4000);

db.exec("BEGIN");
const chatId = Number(db.prepare(`INSERT INTO chats (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((c) => row[c])).lastInsertRowid);
const insert = db.prepare("INSERT INTO chat_events (chat_id, type, data) VALUES (?, ?, json(?))");
const ev = (type, data) => insert.run(chatId, type, JSON.stringify(data));
const sid = randomUUID();
for (let n = 0; n < turns; n++) {
  ev("user", { text: `${n} 回目の依頼です。src/renderer の描画を調べて、重いところを直してください。`.repeat(2), message_uuid: randomUUID() });
  ev("init", { session_id: sid, model: "claude-opus-5-5", permission_mode: "auto" });
  ev("thinking", { text: "考えています。".repeat(40), duration_ms: 1200 });
  const tools = 6 + Math.floor(random() * 9);
  for (let k = 0; k < tools; k++) {
    const id = `toolu_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const kind = pick(["Read", "Edit", "Bash", "Grep"]);
    const input =
      kind === "Read" ? { file_path: `/Users/x/proj/src/file${k}.ts` }
      : kind === "Edit" ? { file_path: `/Users/x/proj/src/file${k}.ts`, old_string: code.slice(0, 800), new_string: code.slice(0, 900) }
      : kind === "Bash" ? { command: "npm run typecheck", description: "型を確かめる" }
      : { pattern: "useMemo", path: "src" };
    ev("tool_use", { id, name: kind, input });
    ev("tool_result", { tool_use_id: id, content: kind === "Read" ? readOut : "ok\n".repeat(20), is_error: false });
    if (k % 3 === 0) ev("text", { text: "次にこのファイルを見ます。" });
  }
  ev("text", { text: md });
  ev("result", { status: "completed", text: md, session_id: sid, message_id: randomUUID() });
}
db.exec("COMMIT");
const stats = db.prepare("SELECT count(*) AS n, sum(length(data)) AS bytes FROM chat_events WHERE chat_id = ?").get(chatId);
console.log(JSON.stringify({ chatId, events: stats.n, bytes: stats.bytes }));
