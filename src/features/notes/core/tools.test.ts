// ノートを開く・動かすツール（open_note・move_note）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import { testStore } from "@/app/core/testing/testStore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { callDef, testTurn } from "@/foundation/core/testing/toolCalls";
import { createNoteDirs } from "./noteDir";
import { createNoteTransfer } from "./noteTransfer";
import { NoteService } from "./service";
import { moveNoteToolGroup, notePathIn, openNoteToolGroup } from "./tools";

/** 組のツールを chatId のチャットから呼ぶ */
const callIn = (group: AiToolGroup, chatId: number, args: Record<string, unknown>) => callDef(group.open(testTurn({ chatId }))![0], args);

/** 店とプロジェクトに、根 ─ 子 ─ 孫 と、ノートのフォルダ（図・画像・前の案）・ノートのチャットを用意する */
function setup() {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: tempDir(), provider: "claude" });
  const ctx = { store, project };
  const base = { project_id: project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, note_path: null };
  const root = store.chats.create({ ...base, title: "根", parent_chat_id: null });
  const child = store.chats.create({ ...base, title: "子", parent_chat_id: root.id });
  const grandchild = store.chats.create({ ...base, title: "孫", parent_chat_id: child.id });
  const dirs = createNoteDirs({ projects: store.projects, notesDir: () => null, defaultDir: tempDir() });
  const service = new NoteService({ dirs, projects: store.projects, publish: () => {}, trashBin: { putPath: async () => { throw new Error("使わない"); } } });
  // 動かしたらノートのチャットを付け替える（組み立てと同じ）
  service.onMoved((e) => store.chats.remapNotePath(e.project_id, e.from, e.to));
  const dir = dirs.dirOf(store.projects.get(project.id)!);
  fs.mkdirSync(path.join(dir, "機能の仕様"), { recursive: true });
  fs.mkdirSync(path.join(dir, "済"), { recursive: true });
  fs.writeFileSync(path.join(dir, "機能の仕様", "図.html"), "<h1>図</h1>");
  fs.writeFileSync(path.join(dir, "画像.png"), "");
  fs.writeFileSync(path.join(dir, "案.md"), "# 案");
  fs.writeFileSync(path.join(dir, "済", "前の案.md"), "# 前");
  const noteChat = store.chats.create({ ...base, title: "案のノートのチャット", parent_chat_id: null, note_path: "案.md" });
  // 共通のノート（見えないプロジェクト。本体とノートのフォルダが同じ）
  const commonDir = tempDir();
  const commonProject = store.projects.create({ name: "共通のノート", repo_path: commonDir, provider: "claude", kind: "common" });
  store.projects.update(commonProject.id, { note_dir: commonDir });
  fs.mkdirSync(path.join(commonDir, "メモ"), { recursive: true });
  fs.writeFileSync(path.join(commonDir, "覚え書き.md"), "# 覚え書き");
  const commonState = { available: true };
  const common = { project: () => (commonState.available ? store.projects.get(commonProject.id)! : null), unavailable: () => (commonState.available ? null : { message: "重なっています", project_id: null }) };
  const published: BusEvent[] = [];
  // チャットを移す口の代わり（区切り・セッションの写しは workplaceMove のテストで見る。ここはプロジェクトだけ移す）
  const busy = new Set<number>();
  const moveChat = async (chatId: number, input: { projectId?: number }) => store.chats.move(chatId, input.projectId!);
  const transfer = createNoteTransfer({ notes: service, store, isBusy: (chatId) => busy.has(chatId), moveChat, common });
  const deps = { store, dirOf: dirs.dirOf, transfer, common, publish: (e: BusEvent) => published.push(e) };
  return { ctx, root, child, grandchild, noteChat, dir, commonDir, commonProject, commonState, busy, published, open: openNoteToolGroup(deps), move: moveNoteToolGroup(deps) };
}

test("notePathIn: 相対・中の絶対パスはノートのフォルダからの相対パスに、外・フォルダそのもの・「.」で始まる名前は断る", () => {
  const dir = tempDir();
  assert.equal(notePathIn(dir, "a/b.md"), "a/b.md");
  assert.equal(notePathIn(dir, path.join(dir, "a", "b.md")), "a/b.md");
  assert.throws(() => notePathIn(dir, "../外.md"), /外です/);
  assert.throws(() => notePathIn(dir, "/etc/hosts"), /外です/);
  assert.throws(() => notePathIn(dir, dir), /フォルダそのもの/);
  assert.throws(() => notePathIn(dir, ".hidden/a.md"), /「\.」で始まる/);
  assert.throws(() => notePathIn(dir, "  "), /空です/);
});

test("open_note: 孫チャットからでも、場所と頼んだチャットまでの系譜を付けて画面に頼む", async () => {
  const { root, child, grandchild, dir, published, open, ctx } = setup();
  const result = await callIn(open, grandchild.id, { path: path.join(dir, "機能の仕様", "図.html"), place: "window" });
  assert.match(result, /別ウィンドウ/);
  assert.equal(published.length, 1);
  const e = published[0];
  assert.ok(e.type === "open_view" && e.request.kind === "note");
  assert.equal(e.request.project_id, ctx.project.id);
  assert.equal(e.request.path, "機能の仕様/図.html");
  assert.equal(e.request.place, "window");
  assert.deepEqual(
    e.request.lineage.map((c) => c.id),
    [root.id, child.id, grandchild.id],
  );
  // 場所を省くと null（画面の設定の開き方）
  const plain = await callIn(open, child.id, { path: "機能の仕様/図.html" });
  assert.match(plain, /設定の「チャットからノートを開く場所」/);
  assert.ok(published[1].type === "open_view" && published[1].request.kind === "note" && published[1].request.place === null);
});

test("open_note: ないノート・ノートでないファイル・外のファイルは断り、画面に頼まない", async () => {
  const { child, published, open } = setup();
  await assert.rejects(callIn(open, child.id, { path: "ない.md" }), /見つかりません/);
  await assert.rejects(callIn(open, child.id, { path: "画像.png" }), /ノート（\.md/);
  await assert.rejects(callIn(open, child.id, { path: "../外.md" }), /外です/);
  assert.equal(published.length, 0);
});

test("move_note: ノートのフォルダの中で動かし、ノートのチャットのつながりも付け替える。上書き・外・拡張子の変更は断る", async () => {
  const { ctx, root, noteChat, dir, move } = setup();
  const moveNote = (args: Record<string, unknown>) => callIn(move, root.id, args);
  assert.match(await moveNote({ from: "案.md", to: "済/案.md" }), /「案.md」を「済\/案.md」に動かしました/);
  assert.ok(fs.existsSync(path.join(dir, "済", "案.md")));
  assert.equal(ctx.store.chats.get(noteChat.id)?.note_path, "済/案.md");
  await assert.rejects(moveNote({ from: "済/案.md", to: "済/前の案.md" }), /同じ名前/);
  await assert.rejects(moveNote({ from: "済/案.md", to: "../外.md" }), /外です/);
  await assert.rejects(moveNote({ from: "済/案.md", to: "済/案.html" }), /拡張子は変えられません/);
  await assert.rejects(moveNote({ from: "ない.md", to: "ある.md" }), /見つかりません/);
  // フォルダごと
  await moveNote({ from: "済", to: "archive/2026" });
  assert.equal(ctx.store.chats.get(noteChat.id)?.note_path, "archive/2026/案.md");
});

test("open_note: scope common か共通のノートのフォルダの中の絶対パスなら、共通のノートのプロジェクトの id で画面に頼む。使えなければ理由を添えて断る", async () => {
  const { child, commonDir, commonProject, commonState, published, open } = setup();
  await callIn(open, child.id, { path: "覚え書き.md", scope: "common" });
  // scope を省いても（project でも）、共通のノートのフォルダの中の絶対パスは共通のノート
  await callIn(open, child.id, { path: path.join(commonDir, "覚え書き.md"), scope: "project" });
  assert.deepEqual(
    published.map((e) => (e.type === "open_view" && e.request.kind === "note" ? [e.request.project_id, e.request.path] : null)),
    [
      [commonProject.id, "覚え書き.md"],
      [commonProject.id, "覚え書き.md"],
    ],
  );
  // プロジェクトのノートにない名前は、scope を省けばプロジェクトで探す
  await assert.rejects(callIn(open, child.id, { path: "覚え書き.md" }), /見つかりません/);
  commonState.available = false;
  await assert.rejects(callIn(open, child.id, { path: "覚え書き.md", scope: "common" }), /共通のノートを使えないため.*重なっています/);
});

test("move_note: 共通のノートの中で動かせる。共通のノートとプロジェクトのノートの間は、ノートのチャットごと移す（作業中なら断る）", async () => {
  const { ctx, root, noteChat, dir, commonDir, commonProject, busy, move } = setup();
  const moveNote = (args: Record<string, unknown>) => callIn(move, root.id, args);
  assert.match(await moveNote({ from: "覚え書き.md", to: "メモ/覚え書き.md", scope: "common" }), /動かしました/);
  assert.ok(fs.existsSync(path.join(commonDir, "メモ", "覚え書き.md")));
  // from が共通のノートの絶対パスなら、相対パスの to も共通のノート
  await moveNote({ from: path.join(commonDir, "メモ", "覚え書き.md"), to: "覚え書き.md" });
  assert.ok(fs.existsSync(path.join(commonDir, "覚え書き.md")));
  // 共通のノートからプロジェクトのノートへ（to は scope の project）
  assert.match(await moveNote({ from: path.join(commonDir, "覚え書き.md"), to: "済/覚え書き.md", scope: "project" }), /プロジェクト「p」のノートの「済\/覚え書き.md」に動かしました/);
  assert.ok(fs.existsSync(path.join(dir, "済", "覚え書き.md")) && !fs.existsSync(path.join(commonDir, "覚え書き.md")));
  // ノートのチャットが作業中なら、ファイルを動かさずに理由を返す
  busy.add(noteChat.id);
  await assert.rejects(moveNote({ from: "案.md", to: path.join(commonDir, "案.md") }), /ノートのチャット（か、その子チャット）が作業中/);
  assert.ok(fs.existsSync(path.join(dir, "案.md")));
  busy.clear();
  // プロジェクトのノートから共通のノートへ: チャットも共通のノートのプロジェクトへ移る
  assert.match(await moveNote({ from: "案.md", to: path.join(commonDir, "メモ", "案.md") }), /共通のノートの「メモ\/案.md」に動かしました/);
  const chat = ctx.store.chats.get(noteChat.id)!;
  assert.deepEqual([chat.project_id, chat.note_path], [commonProject.id, "メモ/案.md"]);
});
