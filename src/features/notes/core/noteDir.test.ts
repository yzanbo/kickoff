import { test } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";
import { makeProject } from "@shared/projects/testing";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { createNoteDirs } from "./noteDir";

/** 読んだ回数を数えるプロジェクトの店（ゴミ箱は 1 件） */
function countingStore() {
  const listed = [makeProject(1, { name: "メモ" }), makeProject(2, { name: "メモ", note_folder: "メモ" }), makeProject(3, { note_dir: "/notes/elsewhere" }), makeProject(4, { name: "作業" })];
  const trashed = [makeProject(5, { name: "作業", note_folder: "作業" })];
  const reads = { list: 0, trashed: 0 };
  const store = {
    get: (id: number) => listed.find((p) => p.id === id),
    list: () => (reads.list++, listed),
    trashed: () => (reads.trashed++, trashed),
    // フォルダ名を決めて覚えるのは ensureNoteDir だけ（ここでは呼ばない）
    update: (): never => {
      throw new Error("update は呼ばない");
    },
  };
  return { listed, reads, store };
}

test("ノートのフォルダ: dirsOf は並べた dirOf と同じフォルダを返し、一覧とゴミ箱は 1 回だけ読む", () => {
  const { listed, reads, store } = countingStore();
  const dirs = createNoteDirs({ projects: store, notesDir: () => "/notes", defaultDir: "/default" });
  const each = listed.map((p) => dirs.dirOf(p));
  assert.deepEqual(each, ["/notes/メモ-2", "/notes/メモ", "/notes/elsewhere", "/notes/作業-2"]);
  reads.list = reads.trashed = 0;
  assert.deepEqual(dirs.dirsOf(listed), each);
  assert.deepEqual(reads, { list: 1, trashed: 1 });
});

test("ノートのフォルダ: noteDirOwners は、何度引いても usersOf と同じプロジェクトを返し、一覧は 1 回だけ読む", () => {
  const root = tempDir({ real: true });
  const { reads, store } = countingStore();
  const dirs = createNoteDirs({ projects: store, notesDir: () => root, defaultDir: "/default" });
  const asked = [path.join(root, "メモ"), "/notes/elsewhere", path.join(root, "作業"), path.join(root, "メモ", "..", "メモ")];
  for (const except of [undefined, 2]) {
    const expected = asked.map((dir) => dirs.usersOf(dir, except).map((p) => p.id));
    reads.list = 0;
    const ownersOf = dirs.noteDirOwners(except);
    assert.deepEqual(asked.map((dir) => ownersOf(dir).map((p) => p.id)), expected);
    assert.equal(reads.list, 1);
  }
  assert.deepEqual(dirs.usersOf(path.join(root, "メモ")).map((p) => p.id), [2]);
  assert.deepEqual(dirs.usersOf(path.join(root, "メモ"), 2), []);
});
