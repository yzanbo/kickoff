import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "./store.js";
import type { BusEvent } from "@shared/types";

function setup() {
  const events: BusEvent[] = [];
  const store = new Store(":memory:", (e) => events.push(e));
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  return { store, events, project };
}

test("プロジェクトを作成すると既定値が入り、変更が通知される", () => {
  const { project, events } = setup();
  assert.equal(project.provider, "claude");
  // 使わなくなった列（テスト・デプロイ・自動コミットなど）は返さない
  for (const key of ["test_command", "deploy_instructions", "auto_commit", "current_phase", "write_scopes"]) assert.equal(key in project, false, key);
  assert.equal(events.at(-1)?.type, "project");
});

test("中断された実行は起動時に失敗扱いになる", () => {
  const { store, project } = setup();
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "A", status: "running", model: null });

  const before = store.chats.get(chat.id)!.active_at;
  assert.equal(store.chats.recoverInterrupted("中断しました"), 1);
  const recovered = store.chats.get(chat.id)!;
  assert.deepEqual([recovered.status, recovered.error, recovered.unread], ["failed", "中断しました", true]);
  // 起動時の復旧は「動いた」ではないので、並び順の時刻は変えない
  assert.equal(recovered.active_at, before);
});

test("実行イベントは JSON で保存され、順番どおりに読み出せる", () => {
  const { store, project } = setup();
  const chat = store.chats.create({
    project_id: project.id,
    provider: "claude",
    title: "壁打ち",
    status: "running",
    model: null,
  });
  store.events.add(chat.id, { type: "user", text: "こんにちは" , message_uuid: "u4" });
  store.events.add(chat.id, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } });

  const events = store.events.list(chat.id);
  assert.deepEqual(
    events.map((e) => e.type),
    ["user", "tool_use"],
  );
  assert.deepEqual(events[1].data, { id: "t1", name: "Read", input: { file_path: "a.ts" } });
});

test("設定は既定値とマージされる", () => {
  const { store } = setup();
  assert.equal(store.settings.get().auto_archive_days, null);
  store.settings.update({ auto_archive_days: 4 });
  assert.equal(store.settings.get().auto_archive_days, 4);
  assert.equal(store.settings.get().default_provider, "claude");
});

test("チャットのやり取りをキーワードで検索できる（範囲の絞り込み・記号のエスケープ）", () => {
  const { store, project } = setup();
  const other = store.projects.create({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const mk = (projectId: number, title: string) =>
    store.chats.create({ project_id: projectId, provider: "claude", title, status: "completed", model: null });
  const a = mk(project.id, "ログインの相談");
  const b = mk(other.id, "別プロジェクト");
  store.events.add(a.id, { type: "user", text: "ログイン方式は OAuth にしたい" , message_uuid: "u5" });
  store.events.add(a.id, { type: "text", text: "OAuth なら GitHub ログインが手軽です。100% 対応できます。" });
  store.events.add(a.id, { type: "tool_use", id: "t", name: "Read", input: { file_path: "oauth.md" } });
  store.events.add(b.id, { type: "user", text: "oauth の話" , message_uuid: "u6" });

  const all = store.events.search("oauth");
  assert.equal(all.length, 3);
  assert.equal(all[0].chat_title, "別プロジェクト");

  const inProject = store.events.search("OAuth", { projectId: project.id });
  assert.deepEqual(
    inProject.map((h) => h.type),
    ["text", "user"],
  );
  const hit = inProject[0];
  assert.equal(hit.snippet.slice(hit.match_start, hit.match_end), "OAuth");

  // % や _ はワイルドカードではなく文字として探す
  assert.equal(store.events.search("100%").length, 1);
  assert.equal(store.events.search("%").length, 1);
  assert.equal(store.events.search("", {}).length, 0);
  assert.equal(store.events.search("ログイン", { chatId: b.id }).length, 0);
});

test("グループ: 作成順に並び、並べ替え・削除するとチャットはグループなしに戻る", () => {
  const { store, project, events } = setup();
  const a = store.groups.create(project.id, "コードレビュー");
  const b = store.groups.create(project.id, "調査");
  assert.deepEqual(store.groups.list(project.id).map((g) => g.name), ["コードレビュー", "調査"]);

  const chat = store.chats.create({
    project_id: project.id,
    provider: "claude",
    title: "レビュー依頼",
    status: "completed",
    model: null,
  });
  const before = store.chats.get(chat.id)!.active_at;
  assert.equal(store.chats.setGroup(chat.id, a.id).group_id, a.id);
  // グループへ移しても、新しい順の並びは変わらない
  assert.equal(store.chats.get(chat.id)!.active_at, before);

  store.groups.reorder(project.id, [b.id, a.id]);
  assert.deepEqual(store.groups.list(project.id).map((g) => g.name), ["調査", "コードレビュー"]);

  events.length = 0;
  store.groups.delete(a.id);
  assert.equal(store.chats.get(chat.id)!.group_id, null);
  assert.deepEqual(events.map((e) => e.type), ["chat", "group_deleted"]);
});

test("プロジェクトの既定は JSON で保存され、壊れていなければそのまま読める", () => {
  const { store, project } = setup();
  assert.deepEqual(project.chat_defaults, {});
  const updated = store.projects.update(project.id, { chat_defaults: { model: "haiku", effort: null } });
  assert.deepEqual(updated.chat_defaults, { model: "haiku", effort: null });
});

test("プロジェクトの並び順: 作った順に付き、並べ替えられる", () => {
  const { store, project } = setup();
  const b = store.projects.create({ name: "b", repo_path: "/tmp/b", provider: "claude" });
  assert.ok(b.position > project.position);
  store.projects.reorder([b.id, project.id]);
  assert.ok(store.projects.get(b.id)!.position < store.projects.get(project.id)!.position);
});

/** チャットを 1 つ作る（テストの既定: 要件定義・完了） */
function mkChat(store: Store, projectId: number, title: string, extra: Partial<Parameters<Store["chats"]["create"]>[0]> = {}) {
  return store.chats.create({ project_id: projectId, provider: "claude", title, status: "completed", model: null, ...extra });
}

test("チャットの一覧: アーカイブ済みを含める・だけ・状態・件数で絞り込める（新しい順）", () => {
  const { store, project } = setup();
  const other = store.projects.create({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const a = mkChat(store, project.id, "a");
  const b = mkChat(store, project.id, "b", { status: "running" });
  const c = mkChat(store, project.id, "c", { status: "failed" });
  const d = mkChat(store, other.id, "d");
  store.chats.archive(c.id, true);
  const ids = (chats: { id: number }[]) => chats.map((r) => r.id);

  // 既定はアーカイブしていないものだけ。新しい順
  assert.deepEqual(ids(store.chats.list()), [d.id, b.id, a.id]);
  assert.deepEqual(ids(store.chats.list({ projectId: project.id })), [b.id, a.id]);
  assert.deepEqual(ids(store.chats.list({ projectId: project.id, includeArchived: true })), [c.id, b.id, a.id]);
  assert.deepEqual(ids(store.chats.list({ projectId: project.id, onlyArchived: true })), [c.id]);
  // 状態（アーカイブ済みは含めない限り出ない）
  assert.deepEqual(ids(store.chats.list({ statuses: ["running", "failed"] })), [b.id]);
  assert.deepEqual(ids(store.chats.list({ statuses: ["running", "failed"], includeArchived: true })), [c.id, b.id]);
  assert.deepEqual(ids(store.chats.list({ statuses: [] })), [d.id, b.id, a.id]);
  // 件数
  assert.deepEqual(ids(store.chats.list({ limit: 2 })), [d.id, b.id]);
});

test("ワークツリーのチャット: 作業場所で探し、片付けると本体に戻る（並び順は変えず、変更を知らせる）", () => {
  const { store, project, events } = setup();
  const other = store.projects.create({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const wt = "/tmp/demo-worktrees/feat-a";
  const inWt = mkChat(store, project.id, "a", { worktree_path: wt });
  const inWt2 = mkChat(store, project.id, "b", { worktree_path: wt });
  const inMain = mkChat(store, project.id, "c");
  const otherWt = mkChat(store, other.id, "d", { worktree_path: wt });
  assert.deepEqual(store.chats.inWorktree(project.id, wt).map((r) => r.id), [inWt.id, inWt2.id]);
  assert.deepEqual(store.chats.inWorktree(project.id, "/tmp/none"), []);

  const before = store.chats.get(inWt.id)!.active_at;
  events.length = 0;
  store.chats.clearWorktree(project.id, wt);
  assert.equal(store.chats.get(inWt.id)!.worktree_path, null);
  assert.equal(store.chats.get(inWt2.id)!.worktree_path, null);
  assert.equal(store.chats.get(inWt.id)!.active_at, before);
  // ほかのプロジェクト・本体のチャットは触らない
  assert.equal(store.chats.get(otherWt.id)!.worktree_path, wt);
  assert.equal(store.chats.get(inMain.id)!.worktree_path, null);
  assert.deepEqual(events.map((e) => e.type === "chat" && e.chat.id), [inWt.id, inWt2.id]);
  assert.deepEqual(store.chats.inWorktree(project.id, wt), []);
  // もう一度片付けても何も知らせない
  events.length = 0;
  store.chats.clearWorktree(project.id, wt);
  assert.deepEqual(events, []);
});

test("プロジェクトの既定・参照資料は JSON で保存され、そのまま読み戻せる", () => {
  const { store, project } = setup();
  assert.equal("write_scopes" in project, false);
  assert.deepEqual(project.reference_paths, []);
  const references = [
    { path: "/tmp/spec", kind: "folder" as const },
    { path: "/tmp/notes.md", kind: "file" as const },
  ];
  const updated = store.projects.update(project.id, {
    chat_defaults: { model: "haiku", effort: "high", permission_mode: "auto", fast_mode: true },
    reference_paths: references,
    pinned: true,
    hue: 222,
  });
  assert.deepEqual(updated.chat_defaults, { model: "haiku", effort: "high", permission_mode: "auto", fast_mode: true });
  assert.deepEqual(updated.reference_paths, references);
  assert.equal(updated.pinned, true);
  assert.equal(updated.hue, 222);
  // 読み直しても同じ。書いていない項目はそのまま
  const again = store.projects.get(project.id)!;
  assert.deepEqual(again, updated);
  const partial = store.projects.update(project.id, { name: "renamed" });
  assert.equal(partial.name, "renamed");
  assert.deepEqual(partial.reference_paths, references);
  // 参照資料を空にできる。フォルダのパスで探せる
  assert.deepEqual(store.projects.update(project.id, { reference_paths: [] }).reference_paths, []);
  assert.equal(store.projects.findByPath("/tmp/demo")?.id, project.id);
  assert.equal(store.projects.findByPath("/tmp/none"), undefined);
});

test("索引: チャットの一覧（プロジェクトごと）・作業場所の引き当て・起動時の復旧は索引を使う（EXPLAIN QUERY PLAN）", () => {
  const { store, project } = setup();
  const { db } = store;
  // store が実際に投げる SQL を拾い、その実行計画を見る
  const prepare = db.prepare.bind(db);
  const issued: string[] = [];
  db.prepare = (sql: string) => (issued.push(sql), prepare(sql));
  const plansOf = (call: () => unknown) => {
    issued.length = 0;
    call();
    return issued.map((sql) => (prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((r) => r.detail).join(" / "));
  };
  assert.match(plansOf(() => store.chats.list({ projectId: project.id }))[0], /^SEARCH chats USING INDEX idx_chats_project \(project_id=\? AND archived_at=\?\)$/);
  assert.match(plansOf(() => store.chats.inWorktree(project.id, "/tmp/demo-worktrees/a"))[0], /^SEARCH chats USING INDEX idx_chats_worktree \(project_id=\? AND worktree_path=\?\)$/);
  assert.match(plansOf(() => store.chats.recoverInterrupted("x"))[0], /SEARCH chats USING INDEX idx_chats_running \(status=\?\)/);
});


test("スキーマの守り: 同じフォルダの重複登録・ほかのプロジェクトのグループ・JSON の形は DB が断る", () => {
  const { store, project } = setup();
  assert.throws(() => store.projects.create({ name: "dup", repo_path: project.repo_path, provider: "claude" }), /UNIQUE constraint failed/);
  const other = store.projects.create({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const otherGroup = store.groups.create(other.id, "よそ");
  assert.throws(() => store.chats.create({ project_id: project.id, provider: "claude", title: "x", status: "completed", group_id: otherGroup.id }), /another project/);
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "x", status: "completed" });
  assert.throws(() => store.chats.setGroup(chat.id, otherGroup.id), /another project/);
  // プロジェクトを移すときはグループも外すので通る
  assert.equal(store.chats.move(chat.id, other.id).project_id, other.id);
  assert.throws(() => store.db.exec(`UPDATE projects SET tags = '{}' WHERE id = ${project.id}`), /CHECK constraint failed/);
  assert.throws(() => store.db.exec(`UPDATE projects SET chat_defaults = '[]' WHERE id = ${project.id}`), /CHECK constraint failed/);
  assert.throws(() => store.db.exec(`UPDATE chats SET worktree_path = '' WHERE id = ${chat.id}`), /CHECK constraint failed/);
});

test("秘密の値は設定とは別の表に置き、設定の一覧には出さない。DB の ID は作ったときに決まる", () => {
  const { store } = setup();
  assert.equal(store.secrets.get("openai_transcribe_key"), null);
  store.secrets.set("openai_transcribe_key", "sk-test");
  assert.equal(store.secrets.get("openai_transcribe_key"), "sk-test");
  assert.ok(!JSON.stringify(store.settings.get()).includes("sk-test"));
  store.secrets.set("openai_transcribe_key", "");
  assert.equal(store.secrets.get("openai_transcribe_key"), null);
  assert.match(store.databaseId, /^[0-9a-f]{32}$/);
  assert.notEqual(new Store(":memory:").databaseId, store.databaseId);
});

test("設定: 既定とマージし、チャットの選択の既定は項目が欠けても既定で埋める", () => {
  const { store } = setup();
  assert.deepEqual(store.settings.get().chat_defaults, { model: "opus", effort: null, permission_mode: "default", fast_mode: false });
  store.db.prepare("INSERT INTO settings (key, value) VALUES ('chat_defaults', ?)").run(JSON.stringify({ model: "sonnet" }));
  assert.deepEqual(store.settings.get().chat_defaults, { model: "sonnet", effort: null, permission_mode: "default", fast_mode: false });
  assert.equal(store.settings.update({ auto_archive_days: 7 }).auto_archive_days, 7);
});

test("診断の集計: チャットと記録の数、記録の多いチャット（多い順）。メモリの DB ならファイルの大きさは 0", () => {
  const { store, project } = setup();
  const chat = (title: string) => store.chats.create({ project_id: project.id, provider: "claude", title, status: "completed", model: null });
  const quiet = chat("静か");
  const busy = chat("長い");
  store.events.add(quiet.id, { type: "notice", message: "a" });
  for (const message of ["a", "b", "c"]) store.events.add(busy.id, { type: "notice", message });
  assert.deepEqual(store.stats(), {
    dbMB: 0,
    walMB: 0,
    chats: 2,
    events: 4,
    busiestChats: [
      { id: busy.id, events: 3, title: "長い", status: "completed" },
      { id: quiet.id, events: 1, title: "静か", status: "completed" },
    ],
  });
});

test("子チャットのアーカイブ: 親をしまうと子孫も一緒に、戻すと一緒にしまったものだけ戻す。子だけをしまう・戻すときは親に触らない", () => {
  const { store, project } = setup();
  const parent = mkChat(store, project.id, "親");
  const a = mkChat(store, project.id, "子 A", { parent_chat_id: parent.id });
  const b = mkChat(store, project.id, "子 B", { parent_chat_id: parent.id });
  const aChild = mkChat(store, project.id, "A の子", { parent_chat_id: a.id });
  const bChild = mkChat(store, project.id, "B の子", { parent_chat_id: b.id });
  const archived = (id: number) => store.chats.get(id)!.archived_at !== null;
  const state = () => [parent, a, b, aChild, bChild].map((c) => archived(c.id));

  // 子だけをしまう: その子と、その下だけ。親・兄弟はそのまま
  store.chats.archive(b.id, true);
  assert.deepEqual(state(), [false, false, true, false, true]);
  const bArchivedAt = store.chats.get(b.id)!.archived_at;

  // 親をしまう: まだしまっていない子孫も一緒に。先にしまっていた子の日時は変えない
  store.chats.archive(parent.id, true);
  assert.deepEqual(state(), [true, true, true, true, true]);
  assert.equal(store.chats.get(b.id)!.archived_at, bArchivedAt);

  // 親を戻す: 一緒にしまった子孫（A と A の子）だけ戻り、子だけでしまっていた B とその下はしまったまま
  store.chats.archive(parent.id, false);
  assert.deepEqual(state(), [false, false, true, false, true]);

  // B を戻すと、B と一緒にしまった B の子も戻る
  store.chats.archive(b.id, false);
  assert.deepEqual(state(), [false, false, false, false, false]);
  // Chat には内部の印を出さない
  assert.equal("archived_with_parent" in store.chats.get(a.id)!, false);
});

test("自動のアーカイブ: 親のないチャットだけを見て、子孫も一緒にしまう。しまっていない子孫が最近動いた・未読ならしまわない", () => {
  const { store, project } = setup();
  const parent = mkChat(store, project.id, "親");
  const child = mkChat(store, project.id, "子", { parent_chat_id: parent.id });
  const busyParent = mkChat(store, project.id, "親 2");
  const unreadChild = mkChat(store, project.id, "子 2", { parent_chat_id: busyParent.id });
  store.chats.setUnread(unreadChild.id, true);
  const later = new Date(Date.now() + 8 * 86_400_000);
  // 数えるのは親だけ（子孫は親と一緒）
  assert.equal(store.chats.archiveStale(7, later), 1);
  assert.deepEqual([parent, child, busyParent, unreadChild].map((c) => store.chats.get(c.id)!.archived_at !== null), [true, true, false, false]);
  // 一緒にしまった子は、親を戻すと戻る
  store.chats.archive(parent.id, false);
  assert.equal(store.chats.get(child.id)!.archived_at, null);
});
