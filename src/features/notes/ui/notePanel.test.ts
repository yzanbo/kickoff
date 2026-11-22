import assert from "node:assert/strict";
import { test } from "vitest";
import { noteTab } from "@/features/panel/ui";
import { movedNoteTab, trashedNoteTab } from "./notePanel";

test("名前を変えた・ゴミ箱に入れたノートのタブは、チャットの右の欄のもの（チャット付き）も付け替える・閉じる。ほかのプロジェクト・ほかのノートは触らない", () => {
  const inSide = noteTab({ chatId: 5, projectId: 1, path: "設計/DB.md" });
  const inNotes = noteTab({ chatId: null, projectId: 1, path: "設計/DB.md" });
  const other = noteTab({ chatId: 5, projectId: 2, path: "設計/DB.md" });
  const moved = movedNoteTab(1, "設計", "設計ノート");
  assert.deepEqual(moved(inSide), noteTab({ chatId: 5, projectId: 1, path: "設計ノート/DB.md" }));
  assert.deepEqual(moved(inNotes), noteTab({ chatId: null, projectId: 1, path: "設計ノート/DB.md" }));
  assert.equal(moved(other), other);
  const trashed = trashedNoteTab(1, "設計/DB.md");
  assert.equal(trashed(inSide), null);
  assert.equal(trashed(other), other);
  assert.equal(trashed(noteTab({ chatId: 5, projectId: 1, path: "設計2.md" }))?.path, "設計2.md");
});
