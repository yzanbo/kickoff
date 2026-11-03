import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "./store.js";
import type { BusEvent } from "./types.js";

function setup() {
  const events: BusEvent[] = [];
  const store = new Store(":memory:", (e) => events.push(e));
  const project = store.createProject({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
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
  const run = store.createRun({ project_id: project.id, provider: "claude", title: "A", status: "running", model: null });

  assert.equal(store.recoverInterruptedRuns(), 1);
  assert.equal(store.getRun(run.id)?.status, "failed");
});

test("実行イベントは JSON で保存され、順番どおりに読み出せる", () => {
  const { store, project } = setup();
  const run = store.createRun({
    project_id: project.id,
    provider: "claude",
    title: "壁打ち",
    status: "running",
    model: null,
  });
  store.addEvent(run.id, { type: "user", text: "こんにちは" });
  store.addEvent(run.id, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } });

  const events = store.listEvents(run.id);
  assert.deepEqual(
    events.map((e) => e.type),
    ["user", "tool_use"],
  );
  assert.deepEqual(events[1].data, { id: "t1", name: "Read", input: { file_path: "a.ts" } });
});

test("設定は既定値とマージされる", () => {
  const { store } = setup();
  assert.equal(store.getSettings().maxConcurrentRuns, 2);
  store.updateSettings({ maxConcurrentRuns: 4 });
  assert.equal(store.getSettings().maxConcurrentRuns, 4);
  assert.equal(store.getSettings().defaultProvider, "claude");
});

test("チャットのやり取りをキーワードで検索できる（範囲の絞り込み・記号のエスケープ）", () => {
  const { store, project } = setup();
  const other = store.createProject({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const mk = (projectId: number, title: string) =>
    store.createRun({ project_id: projectId, provider: "claude", title, status: "completed", model: null });
  const a = mk(project.id, "ログインの相談");
  const b = mk(other.id, "別プロジェクト");
  store.addEvent(a.id, { type: "user", text: "ログイン方式は OAuth にしたい" });
  store.addEvent(a.id, { type: "text", text: "OAuth なら GitHub ログインが手軽です。100% 対応できます。" });
  store.addEvent(a.id, { type: "tool_use", id: "t", name: "Read", input: { file_path: "oauth.md" } });
  store.addEvent(b.id, { type: "user", text: "oauth の話" });

  const all = store.searchEvents("oauth");
  assert.equal(all.length, 3);
  assert.equal(all[0].run_title, "別プロジェクト");

  const inProject = store.searchEvents("OAuth", { projectId: project.id });
  assert.deepEqual(
    inProject.map((h) => h.type),
    ["text", "user"],
  );
  const hit = inProject[0];
  assert.equal(hit.snippet.slice(hit.match_start, hit.match_end), "OAuth");

  // % や _ はワイルドカードではなく文字として探す
  assert.equal(store.searchEvents("100%").length, 1);
  assert.equal(store.searchEvents("%").length, 1);
  assert.equal(store.searchEvents("", {}).length, 0);
  assert.equal(store.searchEvents("ログイン", { runId: b.id }).length, 0);
});

test("グループ: 作成順に並び、並べ替え・削除するとチャットはグループなしに戻る", () => {
  const { store, project, events } = setup();
  const a = store.createGroup(project.id, "コードレビュー");
  const b = store.createGroup(project.id, "調査");
  assert.deepEqual(store.listGroups(project.id).map((g) => g.name), ["コードレビュー", "調査"]);

  const run = store.createRun({
    project_id: project.id,
    provider: "claude",
    title: "レビュー依頼",
    status: "completed",
    model: null,
  });
  const before = store.getRun(run.id)!.updated_at;
  assert.equal(store.setRunGroup(run.id, a.id).group_id, a.id);
  // グループへ移しても、新しい順の並びは変わらない
  assert.equal(store.getRun(run.id)!.updated_at, before);

  store.reorderGroups(project.id, [b.id, a.id]);
  assert.deepEqual(store.listGroups(project.id).map((g) => g.name), ["調査", "コードレビュー"]);

  events.length = 0;
  store.deleteGroup(a.id);
  assert.equal(store.getRun(run.id)!.group_id, null);
  assert.deepEqual(events.map((e) => e.type), ["run", "group_deleted"]);
});

test("プロジェクトの既定は JSON で保存され、壊れていなければそのまま読める", () => {
  const { store, project } = setup();
  assert.deepEqual(project.defaults, {});
  const updated = store.updateProject(project.id, { defaults: { model: "haiku", effort: null } });
  assert.deepEqual(updated.defaults, { model: "haiku", effort: null });
});

test("プロジェクトの並び順: 作った順に付き、並べ替えられる", () => {
  const { store, project } = setup();
  const b = store.createProject({ name: "b", repo_path: "/tmp/b", provider: "claude" });
  assert.ok(b.position > project.position);
  store.reorderProjects([b.id, project.id]);
  assert.ok(store.getProject(b.id)!.position < store.getProject(project.id)!.position);
});

/** チャットを 1 つ作る（テストの既定: 要件定義・完了） */
function mkRun(store: Store, projectId: number, title: string, extra: Partial<Parameters<Store["createRun"]>[0]> = {}) {
  return store.createRun({ project_id: projectId, provider: "claude", title, status: "completed", model: null, ...extra });
}

test("チャットの一覧: アーカイブ済みを含める・だけ・状態・件数で絞り込める（新しい順）", () => {
  const { store, project } = setup();
  const other = store.createProject({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const a = mkRun(store, project.id, "a");
  const b = mkRun(store, project.id, "b", { status: "running" });
  const c = mkRun(store, project.id, "c", { status: "failed" });
  const d = mkRun(store, other.id, "d");
  store.updateRun(c.id, { archived_at: new Date().toISOString() });
  const ids = (runs: { id: number }[]) => runs.map((r) => r.id);

  // 既定はアーカイブしていないものだけ。新しい順
  assert.deepEqual(ids(store.listRuns()), [d.id, b.id, a.id]);
  assert.deepEqual(ids(store.listRuns({ projectId: project.id })), [b.id, a.id]);
  assert.deepEqual(ids(store.listRuns({ projectId: project.id, includeArchived: true })), [c.id, b.id, a.id]);
  assert.deepEqual(ids(store.listRuns({ projectId: project.id, onlyArchived: true })), [c.id]);
  // 状態（アーカイブ済みは含めない限り出ない）
  assert.deepEqual(ids(store.listRuns({ statuses: ["running", "failed"] })), [b.id]);
  assert.deepEqual(ids(store.listRuns({ statuses: ["running", "failed"], includeArchived: true })), [c.id, b.id]);
  assert.deepEqual(ids(store.listRuns({ statuses: [] })), [d.id, b.id, a.id]);
  // 件数
  assert.deepEqual(ids(store.listRuns({ limit: 2 })), [d.id, b.id]);
});

test("ワークツリーのチャット: 作業場所で探し、片付けると本体に戻る（並び順は変えず、変更を知らせる）", () => {
  const { store, project, events } = setup();
  const other = store.createProject({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const wt = "/tmp/demo-worktrees/feat-a";
  const inWt = mkRun(store, project.id, "a", { worktree_path: wt });
  const inWt2 = mkRun(store, project.id, "b", { worktree_path: wt });
  const inMain = mkRun(store, project.id, "c");
  const otherWt = mkRun(store, other.id, "d", { worktree_path: wt });
  assert.deepEqual(store.runsInWorktree(project.id, wt).map((r) => r.id), [inWt.id, inWt2.id]);
  assert.deepEqual(store.runsInWorktree(project.id, "/tmp/none"), []);

  const before = store.getRun(inWt.id)!.updated_at;
  events.length = 0;
  store.clearRunWorktree(project.id, wt);
  assert.equal(store.getRun(inWt.id)!.worktree_path, "");
  assert.equal(store.getRun(inWt2.id)!.worktree_path, "");
  assert.equal(store.getRun(inWt.id)!.updated_at, before);
  // ほかのプロジェクト・本体のチャットは触らない
  assert.equal(store.getRun(otherWt.id)!.worktree_path, wt);
  assert.equal(store.getRun(inMain.id)!.worktree_path, "");
  assert.deepEqual(events.map((e) => e.type === "run" && e.run.id), [inWt.id, inWt2.id]);
  assert.deepEqual(store.runsInWorktree(project.id, wt), []);
  // もう一度片付けても何も知らせない
  events.length = 0;
  store.clearRunWorktree(project.id, wt);
  assert.deepEqual(events, []);
});

test("プロジェクトの既定・参照資料は JSON で保存され、そのまま読み戻せる", () => {
  const { store, project } = setup();
  assert.equal("write_scopes" in project, false);
  assert.deepEqual(project.references, []);
  const references = [
    { path: "/tmp/spec", kind: "folder" as const },
    { path: "/tmp/notes.md", kind: "file" as const },
  ];
  const updated = store.updateProject(project.id, {
    defaults: { model: "haiku", effort: "high", permission: "auto", fastMode: true },
    references,
    pinned: true,
    hue: 222,
  });
  assert.deepEqual(updated.defaults, { model: "haiku", effort: "high", permission: "auto", fastMode: true });
  assert.deepEqual(updated.references, references);
  assert.equal(updated.pinned, 1);
  assert.equal(updated.hue, 222);
  // 読み直しても同じ。書いていない項目はそのまま
  const again = store.getProject(project.id)!;
  assert.deepEqual({ ...again, updated_at: undefined }, { ...updated, updated_at: undefined });
  const partial = store.updateProject(project.id, { name: "renamed" });
  assert.equal(partial.name, "renamed");
  assert.deepEqual(partial.references, references);
  // 参照資料を空にできる。フォルダのパスで探せる
  assert.deepEqual(store.updateProject(project.id, { references: [] }).references, []);
  assert.equal(store.findProjectByPath("/tmp/demo")?.id, project.id);
  assert.equal(store.findProjectByPath("/tmp/none"), undefined);
});
