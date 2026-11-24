import { onTestFinished, test } from "vitest";
import assert from "node:assert/strict";
import { isNoteMoving, trackOpenNote, whileNoteMoves } from "./noteMoving";

/** 開いた文書をテストの終わりに必ず閉じる（印を次のテストに残さない） */
function openDoc(projectId: number, path: string): () => void {
  let closed = false;
  const close = trackOpenNote(projectId, path);
  const once = () => {
    if (!closed) close();
    closed = true;
  };
  onTestFinished(once);
  return once;
}

test("動かしている間は、そのノートとフォルダの中のノートを動かしている途中と見る（ほかの欄の同じパスは含めない）", async () => {
  const seen = await whileNoteMoves(3, "folder", async () => [isNoteMoving(3, "folder"), isNoteMoving(3, "folder/a.md"), isNoteMoving(3, "folder2/a.md"), isNoteMoving(1, "folder/a.md")]);
  assert.deepEqual(seen, [true, true, false, false]);
  // 元の場所で開いている文書がなければ、終わったらすぐ外す
  assert.equal(isNoteMoving(3, "folder/a.md"), false);
});

test("動かし終えても、元の場所で開いている文書がすべて外れるまで印を残す", async () => {
  const left = openDoc(3, "folder/a.md");
  const right = openDoc(3, "folder/a.md");
  await whileNoteMoves(3, "folder", async () => {});
  assert.equal(isNoteMoving(3, "folder/a.md"), true);
  left();
  assert.equal(isNoteMoving(3, "folder/a.md"), true);
  right();
  assert.equal(isNoteMoving(3, "folder/a.md"), false);
});

test("ほかの欄・ほかのフォルダの文書は印を引き留めない", async () => {
  openDoc(1, "folder/a.md");
  openDoc(3, "other.md");
  await whileNoteMoves(3, "folder", async () => {});
  assert.equal(isNoteMoving(3, "folder/a.md"), false);
});

test("断られたら、開いている文書があってもすぐ印を外す（元の場所にあるので読み直してよい）", async () => {
  openDoc(3, "a.md");
  await assert.rejects(
    whileNoteMoves(3, "a.md", async () => {
      throw new Error("409");
    }),
  );
  assert.equal(isNoteMoving(3, "a.md"), false);
});
