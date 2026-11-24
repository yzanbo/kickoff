// 0018 の作り直しより前の Kickoff のデータ（退避した Kickoff.before-0018）から、チャットを新しい版の DB に取り込む（1 回だけ流す）:
//   node --no-warnings scripts/import-before-0018.mjs [--from <古い保存先>] [--to <新しい保存先>] [--dry-run]
// 製品版の Kickoff を終了してから、macOS のターミナルで流す（動いているアプリの DB を外から書き換えないため）。
// 取り込むもの: プロジェクト（フォルダの場所で突き合わせ、なければ作る）・グループ・チャット（ゴミ箱のものを除く）・記録・
// AI のセッションとの対応・定型文・ワークツリーの色・添付。設定と秘密の値は取り込まない（新しい版で設定し直したものと食い違うため）
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const support = path.join(os.homedir(), "Library", "Application Support");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const fromDir = option("--from", path.join(support, "Kickoff.before-0018"));
const toDir = option("--to", path.join(support, "Kickoff"));
const dryRun = args.includes("--dry-run");

// DB の印（src/foundation/core/db/db.ts の APPLICATION_ID と同じ 'KICK'）。古い系統は user_version が 200 ＋ 版、新しい系統は 300 ＋ 版
const APPLICATION_ID = 0x4b49434b;
const MARKER = "imported_before_0018";
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// 動いているアプリの DB を書き換えない: Electron は保存先に SingletonLock（指す先は「ホスト名-PID」）を置く。
// 落ちたときなどは終了しても残るので、置いた PID のプロセスが生きているかで見る
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM は「ある（別の権限）」、ESRCH は「ない」
    return e.code === "EPERM";
  }
};
const lockPid = () => {
  try {
    const target = readlinkSync(path.join(toDir, "SingletonLock"));
    const pid = Number(target.slice(target.lastIndexOf("-") + 1));
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
};
const pid = lockPid();
if (pid !== null && isAlive(pid)) fail(`Kickoff が動いています（${toDir}・PID ${pid}）。終了してからもう一度流してください`);
if (toDir === path.join(support, "Kickoff")) {
  // コアや Helper は本体のあとに終わることがあるので、アプリの中のプロセスがすべて終わったかを見る
  let running = "";
  try {
    running = execFileSync("pgrep", ["-fl", "/Applications/Kickoff.app/Contents/"], { encoding: "utf8" }).trim();
  } catch {
    // 見つからない（pgrep は 1 で終わる）
  }
  if (running !== "") fail(`製品版の Kickoff のプロセスが残っています。終了してからもう一度流してください:\n${running}`);
}

const oldFile = path.join(fromDir, "kickoff.db");
const newFile = path.join(toDir, "kickoff.db");
if (!existsSync(oldFile)) fail(`古い DB がありません: ${oldFile}`);
if (!existsSync(newFile)) fail(`新しい DB がありません（新しい版を 1 回起動してから流してください）: ${newFile}`);

const pragma = (db, name) => Object.values(db.prepare(`PRAGMA ${name}`).get())[0];
const old = new DatabaseSync(oldFile, { readOnly: true });
const oldVersion = pragma(old, "user_version");
if (pragma(old, "application_id") !== APPLICATION_ID || oldVersion <= 200 || oldVersion >= 300) fail(`古い DB の版が想定と違います（user_version = ${oldVersion}）`);
const db = new DatabaseSync(newFile);
const newVersion = pragma(db, "user_version");
if (pragma(db, "application_id") !== APPLICATION_ID || newVersion <= 300) fail(`新しい DB の版が想定と違います（user_version = ${newVersion}）`);
if (db.prepare("SELECT 1 FROM meta WHERE key = ?").get(MARKER)) fail("この DB にはもう取り込んであります（2 回取り込むとチャットが重なるため止めます）");

// 書く列が新しい版の表にあるか（なければ版が変わったので止める）
const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
const CHAT_COLUMNS = [
  "project_id", "group_id", "note_path", "github_repo", "github_number", "github_kind", "title", "provider", "model", "effort", "permission_mode",
  "fast_mode", "sandbox_enabled", "edit_scope_enabled", "untracked_only", "worktree_path", "branch", "finished_worktree_branch", "status",
  "session_id", "error", "unread", "ai_generation", "cost_usd", "num_turns", "context_tokens", "context_window", "pinned", "position",
  "archived_at", "archived_with_parent", "created_at", "active_at",
];
const PROJECT_COLUMNS = [
  "name", "description", "repo_path", "provider", "hue", "tags", "reference_paths", "note_folder", "note_dir", "pre_compact_prompt",
  "pre_compact_enabled", "post_compact_prompt", "post_compact_enabled", "github_account", "github_remote", "pr_watch", "ci_watch", "position",
  "pinned", "archived_at", "created_at",
];
for (const [table, wanted] of [["chats", CHAT_COLUMNS], ["projects", PROJECT_COLUMNS]]) {
  const have = columns(table);
  const missing = wanted.filter((c) => !have.has(c));
  if (missing.length > 0) fail(`新しい DB の ${table} に列がありません: ${missing.join(", ")}`);
}

const insert = (table, row) => {
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
  return Number(db.prepare(sql).run(...keys.map((k) => row[k])).lastInsertRowid);
};
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

const projectIds = new Map();
const groupIds = new Map();
const chatIds = new Map();
const eventIds = new Map();
const usedUploads = new Set();
const counts = { projectsCreated: 0, projectsMatched: 0, groups: 0, chats: 0, events: 0, sessions: 0, snippets: 0, worktrees: 0, uploads: 0 };

/** 古いノートの添付（kind: memo）を新しい形（kind: note）に直す。古い記録には付けた時刻がないものがあり、記録の時刻で埋める */
function toNoteAttachment(a, at) {
  if (a === null || typeof a !== "object" || a.kind !== "memo") return a;
  const { memo, ...rest } = a;
  return { ...rest, kind: "note", note: memo, taken_at: a.taken_at ?? at };
}

/** 記録の中身の、ID（プロジェクト・チャット・記録）とノートの添付を新しい版に合わせる */
function convertData(type, data, at) {
  if (Array.isArray(data.attachments)) data.attachments = data.attachments.map((a) => toNoteAttachment(a, at));
  if (type === "approval_resolved" && data.attachments) {
    for (const k of Object.keys(data.attachments)) data.attachments[k] = data.attachments[k].map((a) => toNoteAttachment(a, at));
  }
  if (Array.isArray(data.handoff_attachments)) data.handoff_attachments = data.handoff_attachments.map((a) => toNoteAttachment(a, at));
  if (type === "user" && data.handoff_from) {
    const id = chatIds.get(data.handoff_from.chat_id);
    if (id === undefined) delete data.handoff_from;
    else data.handoff_from = { ...data.handoff_from, chat_id: id };
  }
  if (type === "workplace_moved") {
    for (const side of ["from", "to"]) data[side] = { ...data[side], project_id: projectIds.get(data[side].project_id) ?? data[side].project_id };
  }
  if (type === "handoff") {
    data.parent_chat_id = chatIds.get(data.parent_chat_id) ?? data.parent_chat_id;
    data.turn_event_id = eventIds.get(data.turn_event_id) ?? data.turn_event_id;
  }
  if (["user", "approval_resolved", "provider_switched"].includes(type)) for (const m of JSON.stringify(data).matchAll(UUID_PATTERN)) usedUploads.add(m[0]);
  return data;
}

function importProjects() {
  let position = db.prepare("SELECT coalesce(max(position), -1) AS p FROM projects").get().p;
  const takenFolders = new Set(db.prepare("SELECT note_folder FROM projects WHERE note_folder IS NOT NULL").all().map((r) => r.note_folder));
  for (const p of old.prepare("SELECT * FROM projects WHERE trashed_at IS NULL ORDER BY position").all()) {
    const existing = db.prepare("SELECT id FROM projects WHERE repo_path = ?").get(p.repo_path);
    if (existing) {
      projectIds.set(p.id, existing.id);
      counts.projectsMatched++;
      continue;
    }
    // ノートのフォルダ名がほかのプロジェクトと重なれば「名前-2」（新しい版の決め方と同じ）
    let folder = p.memo_folder;
    for (let n = 2; folder !== null && takenFolders.has(folder); n++) folder = `${p.memo_folder}-${n}`;
    if (folder !== null) takenFolders.add(folder);
    const id = insert("projects", {
      ...pick(p, ["name", "repo_path", "provider", "hue", "tags", "reference_paths", "pre_compact_prompt", "pre_compact_enabled", "post_compact_prompt"]),
      ...pick(p, ["post_compact_enabled", "github_account", "github_remote", "pr_watch", "ci_watch", "pinned", "archived_at", "created_at"]),
      description: p.description === "" ? null : p.description,
      note_folder: folder,
      note_dir: p.memo_path,
      position: ++position,
    });
    projectIds.set(p.id, id);
    counts.projectsCreated++;
    // チャットの既定（古い版はプロジェクトの AI の分と、AI ごとの分を別の列に持っていた）
    const defaults = { ...JSON.parse(p.provider_chat_defaults) };
    const own = JSON.parse(p.chat_defaults);
    if (Object.keys(own).length > 0) defaults[p.provider] = { ...defaults[p.provider], ...own };
    for (const [provider, options] of Object.entries(defaults)) {
      if (options && Object.keys(options).length > 0) insert("project_ai_defaults", { project_id: id, provider, options: JSON.stringify(options) });
    }
  }
}

function importGroups() {
  for (const g of old.prepare("SELECT * FROM chat_groups ORDER BY project_id, position").all()) {
    const projectId = projectIds.get(g.project_id);
    if (projectId === undefined) continue;
    const same = db.prepare("SELECT id FROM chat_groups WHERE project_id = ? AND name = ?").get(projectId, g.name);
    if (same) {
      groupIds.set(g.id, same.id);
      continue;
    }
    const position = db.prepare("SELECT coalesce(max(position), -1) + 1 AS p FROM chat_groups WHERE project_id = ?").get(projectId).p;
    groupIds.set(g.id, insert("chat_groups", { project_id: projectId, name: g.name, hue: g.hue, position, created_at: g.created_at }));
    counts.groups++;
  }
}

function importChats() {
  const chats = old.prepare("SELECT * FROM chats WHERE trashed_at IS NULL ORDER BY id").all().filter((c) => projectIds.has(c.project_id));
  const readEvents = old.prepare("SELECT id, type, data, created_at FROM chat_events WHERE chat_id = ? ORDER BY id");
  const addEvent = db.prepare("INSERT INTO chat_events (chat_id, type, data, created_at) VALUES (?, ?, ?, ?)");
  // 親子は全部のチャットを作ってから付ける（子の ID が親より小さいことがあっても付けられるように）
  for (const c of chats) {
    const row = pick(c, CHAT_COLUMNS.filter((k) => k !== "note_path" && k !== "project_id" && k !== "group_id"));
    chatIds.set(c.id, insert("chats", {
      ...row,
      project_id: projectIds.get(c.project_id),
      group_id: c.group_id === null ? null : (groupIds.get(c.group_id) ?? null),
      note_path: c.memo_path,
      // 作業中のまま退避されたチャットは、止まったものとして取り込む（新しい版で動いていない実行を待たせない）
      status: c.status === "running" ? "cancelled" : c.status,
      finished_worktree_branch: c.finished_worktree_branch === "" ? null : c.finished_worktree_branch,
    }));
    counts.chats++;
  }
  for (const c of chats) {
    const chatId = chatIds.get(c.id);
    for (const e of readEvents.all(c.id)) {
      const data = convertData(e.type, JSON.parse(e.data), e.created_at);
      eventIds.set(e.id, Number(addEvent.run(chatId, e.type, JSON.stringify(data), e.created_at).lastInsertRowid));
      counts.events++;
    }
  }
  const setParent = db.prepare("UPDATE chats SET parent_chat_id = ?, parent_event_id = ? WHERE id = ?");
  for (const c of chats) {
    if (c.parent_chat_id === null) continue;
    const parent = chatIds.get(c.parent_chat_id);
    // 親がゴミ箱にあって取り込まなかった子は、親のないチャットにする
    setParent.run(parent ?? null, parent === undefined ? null : (eventIds.get(c.parent_event_id) ?? null), chatIds.get(c.id));
  }
}

function importRest() {
  for (const s of old.prepare("SELECT * FROM chat_provider_sessions").all()) {
    const chatId = chatIds.get(s.chat_id);
    if (chatId === undefined) continue;
    insert("chat_provider_sessions", { chat_id: chatId, provider: s.provider, session_id: s.session_id, last_event_id: eventIds.get(s.last_event_id) ?? null });
    counts.sessions++;
  }
  const addSession = db.prepare("INSERT OR IGNORE INTO agent_sessions (session_id, provider, project_id, cwd, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const s of old.prepare("SELECT * FROM agent_sessions").all()) {
    addSession.run(s.session_id, s.provider, s.project_id === null ? null : (projectIds.get(s.project_id) ?? null), s.cwd, s.created_at);
  }
  for (const s of old.prepare("SELECT * FROM snippets ORDER BY position").all()) {
    const projectId = s.project_id === null ? null : projectIds.get(s.project_id);
    if (projectId === undefined) continue;
    if (db.prepare("SELECT 1 FROM snippets WHERE project_id IS ? AND text = ?").get(projectId, s.text)) continue;
    const position = db.prepare("SELECT coalesce(max(position), -1) + 1 AS p FROM snippets WHERE project_id IS ?").get(projectId).p;
    insert("snippets", { project_id: projectId, label: s.label, text: s.text, position, created_at: s.created_at, updated_at: s.updated_at });
    counts.snippets++;
  }
  // ワークツリーの色は、フォルダがまだあるものだけ（片付けたワークツリーの行を残さない）
  const addWorktree = db.prepare("INSERT INTO worktrees (path, project_id, hue) VALUES (?, ?, ?) ON CONFLICT (path) DO NOTHING");
  for (const w of old.prepare("SELECT * FROM worktree_colors").all()) {
    const projectId = projectIds.get(w.project_id);
    if (projectId === undefined || !existsSync(w.path)) continue;
    counts.worktrees += Number(addWorktree.run(w.path, projectId, w.hue).changes);
  }
  insert("meta", { key: MARKER, value: new Date().toISOString() });
}

/** 取り込んだ記録が使う添付のフォルダを写す（ノートの写しの記録 .attachment.json の memo の形も直す） */
function copyUploads() {
  const from = path.join(fromDir, "uploads");
  const to = path.join(toDir, "uploads");
  if (!existsSync(from)) return;
  for (const id of readdirSync(from)) {
    if (!usedUploads.has(id) || existsSync(path.join(to, id))) continue;
    counts.uploads++;
    if (dryRun) continue;
    cpSync(path.join(from, id), path.join(to, id), { recursive: true });
    const meta = path.join(to, id, ".attachment.json");
    if (existsSync(meta)) {
      const a = JSON.parse(readFileSync(meta, "utf8"));
      if (a.kind === "memo") writeFileSync(meta, JSON.stringify(toNoteAttachment(a, new Date().toISOString())));
    }
  }
}

db.exec("PRAGMA foreign_keys = ON");
if (!dryRun) {
  // 取り込む前の DB を控える（うまくいかなかったら、アプリを終了してこれを kickoff.db に戻す）
  const backup = path.join(toDir, `kickoff.before-import-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
  console.log(`取り込む前の DB を控えました: ${backup}`);
}
db.exec("BEGIN");
try {
  importProjects();
  importGroups();
  importChats();
  importRest();
  const broken = db.prepare("PRAGMA foreign_key_check").all();
  if (broken.length > 0) throw new Error(`外部キーの食い違いがあります: ${JSON.stringify(broken.slice(0, 5))}`);
  db.exec(dryRun ? "ROLLBACK" : "COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  fail(`取り込みをやめました（DB は変えていません）: ${e instanceof Error ? e.message : e}`);
}
copyUploads();
db.close();
old.close();

const c = counts;
console.log(`${dryRun ? "【試しただけ・何も変えていません】" : "取り込みました"}`);
console.log(`プロジェクト: 新しく作った ${c.projectsCreated}・登録済みに入れた ${c.projectsMatched} / グループ: ${c.groups} / チャット: ${c.chats} / 記録: ${c.events}`);
console.log(`AI のセッション: ${c.sessions} / 定型文: ${c.snippets} / ワークツリーの色: ${c.worktrees} / 添付: ${c.uploads}`);
