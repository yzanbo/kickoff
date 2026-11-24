// 決まったデータを作る（npm run fixture:seed が流す。scripts/devtools/fixture.mjs）。
// npx tsx scripts/devtools/seed.ts --root <置き場所> --data <開発版の保存先（置き場所の中）> --now <画面の時計の起点の ms>
// 置き場所のフォルダを消して作り直し、Git のリポジトリ・ノート・SQLite の DB と、保存先に Kickoff の DB を入れて、ID を <置き場所>/fixture.json に書く。
// 時刻はすべて --now からさかのぼった決まった値にする（何度作っても同じ中身になる）。置き場所が一時フォルダ（TMPDIR か /tmp）の下でなければ断る
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import type { ChatEventData } from "@shared/chat/chatEvent";
import type { QueuedMessage } from "@shared/chat/types";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import { DB_FILE } from "../../src/foundation/core/db/db.js";
import { testStore } from "../../src/app/core/testing/testStore.js";

const { values } = parseArgs({ options: { root: { type: "string" }, data: { type: "string" }, now: { type: "string" } } });
if (!values.root || !values.data || !values.now) throw new Error("--root <置き場所>・--data <保存先> と --now <ms> を渡してください");
const dir = path.resolve(values.root);
const dataDir = path.resolve(values.data);
// SQLite の DB などを保存先の外に置く（DB のタブは Kickoff の保存先の中のファイルを開かない）
if (path.dirname(dataDir) !== dir) throw new Error(`保存先は置き場所のすぐ下にしてください: ${dataDir}`);
const now = Number(values.now);
const MINUTE = 60_000;
/** now から ms だけさかのぼった時刻（ISO） */
const ago = (ms: number) => new Date(now - ms).toISOString();

// 一時フォルダの下だけを消して作り直す（製品版・開発版の保存先を消さない）。決まったデータの保存先は TMPDIR でなく /tmp（macOS は /private/tmp）の下
const tmpRoots = [...new Set([os.tmpdir(), "/tmp"].map((d) => fs.realpathSync(d)))];
const parent = fs.realpathSync(path.dirname(dir));
if (!tmpRoots.some((root) => parent === root || parent.startsWith(root + path.sep))) throw new Error(`一時フォルダ（${tmpRoots.join("・")}）の下でない保存先には作りません: ${dir}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

/** ファイルを書き、更新時刻を決まった値にする */
function write(file: string, text: string, at = now - 7 * 24 * 60 * MINUTE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.utimesSync(file, new Date(at), new Date(at));
}

/** Git のコマンド（利用者の設定を読まず、作者と時刻を決まった値にする） */
function git(cwd: string, args: string[], at = now) {
  const date = new Date(at).toISOString();
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const r = spawnSync("git", ["-c", "user.name=Kickoff Fixture", "-c", "user.email=fixture@example.com", "-c", "init.defaultBranch=main", ...args], { cwd, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

// --- プロジェクト alpha の Git のリポジトリ（ファイル 12・コミット 6・ブランチ 2・まだコミットしていない変更 2）
const alphaDir = path.join(dir, "repos", "alpha");
const notesDir = path.join(alphaDir, "notes");
const commits: { message: string; files: Record<string, string> }[] = [
  { message: "最初のコミット", files: { "README.md": "# alpha\n\n決まったデータの確かめ用のリポジトリ。\n", "package.json": '{\n  "name": "alpha",\n  "version": "0.1.0"\n}\n' } },
  { message: "画面の入口を足す", files: { "src/index.ts": 'import { App } from "./components/App";\n\nexport const app = App();\n', "src/components/App.tsx": "export function App() {\n  return null;\n}\n" } },
  { message: "ボタンと見た目を足す", files: { "src/components/Button.tsx": "export function Button() {\n  return null;\n}\n", "src/styles.css": ".button {\n  padding: 4px 8px;\n}\n" } },
  { message: "補助の関数を足す", files: { "src/util.ts": "export const sum = (a: number, b: number) => a + b;\n", "docs/guide.md": "# 使い方\n\n1. 起動する\n2. 開く\n" } },
  { message: "ノートを足す", files: { "notes/plan.md": "# 計画\n\n- 一覧を作る\n- 検索を足す\n", "notes/todo.md": "# やること\n\n- [ ] 名前を決める\n" } },
  { message: "ノートを整える", files: { "notes/meeting.md": "# 打ち合わせ\n\n決めたこと: 段階に分けて進める。\n", "notes/ideas/backlog.md": "# あとで\n\n- 色を選べるようにする\n" } },
];
fs.mkdirSync(alphaDir, { recursive: true });
git(alphaDir, ["init", "-q"]);
commits.forEach((commit, i) => {
  // 1 日ずつ、6 日前から昨日まで
  const at = now - (commits.length - i) * 24 * 60 * MINUTE;
  for (const [file, text] of Object.entries(commit.files)) write(path.join(alphaDir, file), text, at);
  git(alphaDir, ["add", "-A"], at);
  git(alphaDir, ["commit", "-q", "-m", commit.message], at);
  // 4 つ目のコミットから検索のブランチを分ける
  if (i === 3) git(alphaDir, ["branch", "feature/search"], at);
});
write(path.join(alphaDir, "src/util.ts"), "export const sum = (a: number, b: number) => a + b;\nexport const twice = (a: number) => a * 2;\n", now - 30 * MINUTE);
write(path.join(alphaDir, "src/search.ts"), "export const search = (words: string[], q: string) => words.filter((w) => w.includes(q));\n", now - 20 * MINUTE);

// --- プロジェクト beta（Git なしのフォルダ）
const betaDir = path.join(dir, "repos", "beta");
write(path.join(betaDir, "README.md"), "# beta\n\nGit で管理していないフォルダ。\n");
write(path.join(betaDir, "note.txt"), "ノート\n");

// --- SQLite の DB（表 2 つ）
const sqliteFile = path.join(dir, "sample.sqlite");
const sample = new DatabaseSync(sqliteFile);
sample.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT);
  CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL);
  INSERT INTO users (name, email) VALUES ('佐藤', 'sato@example.com'), ('鈴木', 'suzuki@example.com'), ('高橋', NULL);
  INSERT INTO posts (user_id, title) VALUES (1, '始めました'), (1, '続けています'), (2, 'はじめまして');
`);
sample.close();

// --- Kickoff の DB
// 新しいスキーマの空の DB に入れる（置き場所は毎回作り直すので、前の版の DB は残らない）
const store = testStore({ file: path.join(dataDir, DB_FILE) });
/** チャットの店に渡す作成時の入力（chat の店の create の引数） */
type NewChat = Parameters<typeof store.chats.create>[0];
const { db } = store;
db.exec("BEGIN");
const alpha = store.projects.create({ name: "alpha", repo_path: alphaDir, provider: "claude" });
const beta = store.projects.create({ name: "beta", repo_path: betaDir, provider: "claude" });
// ノートのフォルダはプロジェクトごとに保存先の中へ（既定の ~/Documents の下を使わない）
store.projects.update(alpha.id, { note_dir: notesDir });
store.projects.update(beta.id, { note_dir: path.join(dir, "beta-notes") });
const research = store.groups.create(alpha.id, "調べもの");
const fixes = store.groups.create(alpha.id, "直しもの");

interface ChatSpec extends Omit<NewChat, "provider" | "title"> {
  key: string;
  title: string;
  turns: number;
  seed: number;
  unread?: boolean;
  pinned?: boolean;
  archived?: boolean;
  error?: string;
}
// 作業中（running）は入れない（コアが起動で失敗に直すため）。未読 2・失敗（未読）1・固定 1・アーカイブ 1・子 1・孫 1・ノートのチャット 1
const specs: ChatSpec[] = [
  { key: "long", title: "長いチャット（120 回）", project_id: alpha.id, group_id: research.id, status: "completed", turns: 120, seed: 7 },
  { key: "parent", title: "子チャットのある親チャット", project_id: alpha.id, status: "completed", turns: 3, seed: 2 },
  { key: "child", title: "子チャット", project_id: alpha.id, status: "completed", turns: 2, seed: 3 },
  { key: "grandchild", title: "孫チャット", project_id: alpha.id, status: "completed", turns: 1, seed: 4 },
  { key: "queued", title: "送信待ちのあるチャット", project_id: alpha.id, status: "completed", turns: 2, seed: 5 },
  { key: "unread", title: "未読のチャット", project_id: alpha.id, group_id: research.id, status: "completed", turns: 2, seed: 6, unread: true },
  { key: "unread2", title: "もう 1 つの未読", project_id: alpha.id, group_id: fixes.id, status: "completed", turns: 1, seed: 8, unread: true },
  { key: "failed", title: "失敗したチャット", project_id: alpha.id, group_id: fixes.id, status: "failed", turns: 1, seed: 9, unread: true, error: "API Error: Connection error." },
  { key: "cancelled", title: "止めたチャット", project_id: beta.id, status: "cancelled", turns: 1, seed: 10 },
  { key: "pinned", title: "固定したチャット", project_id: alpha.id, status: "completed", turns: 1, seed: 11, pinned: true },
  { key: "archived", title: "アーカイブしたチャット", project_id: alpha.id, status: "completed", turns: 1, seed: 12, archived: true },
  { key: "note", title: "計画のノートのチャット", project_id: alpha.id, status: "completed", turns: 1, seed: 13, note_path: "plan.md" },
];
const chatIds: Record<string, number> = {};
const setEventTime = db.prepare("UPDATE chat_events SET created_at = ? WHERE id = ?");
const setChatTimes = db.prepare("UPDATE chats SET created_at = ?, active_at = ?, turn_started_at = ? WHERE id = ?");
specs.forEach((spec, i) => {
  const { key, turns, seed, unread, pinned, archived, error, ...input } = spec;
  // 子は 1 つ前（親・子）の最後の返答から聞いた
  const parentKey = key === "child" ? "parent" : key === "grandchild" ? "child" : null;
  const parentId = parentKey ? chatIds[parentKey] : null;
  const parentEvent = parentId ? (db.prepare("SELECT max(id) AS id FROM chat_events WHERE chat_id = ?").get(parentId) as { id: number }).id : null;
  const chat = store.chats.create({ ...input, provider: "claude", parent_chat_id: parentId, parent_event_id: parentEvent });
  chatIds[key] = chat.id;
  // 新しいチャットほど上（12 番目のチャットの終わりが 5 分前、1 つ前ごとに 37 分ずつさかのぼる）
  const end = now - (5 + (specs.length - 1 - i) * 37) * MINUTE;
  const events = scenarioChat({ turns, seed, chatId: chat.id });
  let lastUser = end;
  events.forEach((event, j) => {
    const saved = store.events.add(chat.id, { type: event.type, ...event.data } as ChatEventData);
    const at = end - (events.length - 1 - j) * 1000;
    setEventTime.run(new Date(at).toISOString(), saved.id);
    if (event.type === "user") lastUser = at;
  });
  setChatTimes.run(new Date(end - events.length * 1000 - MINUTE).toISOString(), new Date(end).toISOString(), new Date(lastUser).toISOString(), chat.id);
  if (unread) store.chats.setUnread(chat.id, true);
  if (pinned) store.chats.setPinned(chat.id, true);
  if (error) store.chats.update(chat.id, { error });
  if (archived) store.chats.archive(chat.id, true, new Date(end + MINUTE));
});

// 送信待ち 3 件（自動で送るのを止め、2 件目のあとに「ここまで」の線。止めてあるので、起動しても送らず、再開の確かめも出ない）
const queued = (n: number, text: string): QueuedMessage => ({ id: `fixture-queue-${n}`, text, attachments: [], options: {}, created_at: ago((10 - n) * MINUTE) });
store.outbox.save(chatIds.queued, { now: [], later: [queued(1, "次に一覧の並びを直してください"), queued(2, "そのあとテストを足してください"), queued(3, "最後に説明を書き直してください")], paused: true, stops: [2] });

// 定型文 3（共通 2・alpha だけ 1）
const snippetIds = [
  store.snippets.create({ project_id: null, label: "確かめ", text: "型検査とテストを流して、結果を教えてください" }),
  store.snippets.create({ project_id: null, label: null, text: "変更の要約を 3 行で書いてください" }),
  store.snippets.create({ project_id: alpha.id, label: "alpha の決まり", text: "src の外は書き換えないでください" }),
].map((s) => s.id);

// DB の接続 1（SQLite）
const connection = store.dbConnections.create(alpha.id, { name: "サンプル", engine: "sqlite", environment: "local", host: null, port: null, database: null, username: null, file_path: sqliteFile, ssl: null, read_only: false, ai_access: "ask" });

// 作った時刻を決まった値に（プロジェクト・グループ・定型文・DB の接続）
const created = ago(30 * 24 * 60 * MINUTE);
db.prepare("UPDATE projects SET created_at = ?").run(created);
db.prepare("UPDATE chat_groups SET created_at = ?").run(created);
db.prepare("UPDATE snippets SET created_at = ?, updated_at = ?").run(created, created);
db.prepare("UPDATE db_connections SET created_at = ?, updated_at = ?").run(created, created);
db.exec("COMMIT");
db.close();

const fixture = {
  seededAt: new Date(now).toISOString(),
  projects: { alpha: alpha.id, beta: beta.id },
  groups: { research: research.id, fixes: fixes.id },
  chats: chatIds,
  snippets: snippetIds,
  dbConnections: { sample: connection.id },
  notes: ["plan.md", "todo.md", "meeting.md", "ideas/backlog.md"],
};
fs.writeFileSync(path.join(dir, "fixture.json"), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`決まったデータを作りました: ${dir}（チャット ${specs.length}・プロジェクト 2）`);
