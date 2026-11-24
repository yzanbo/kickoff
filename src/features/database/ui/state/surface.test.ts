import assert from "node:assert/strict";
import { test } from "vitest";
import { dbSurfaceKey } from "./surface";

test("dbSurfaceKey: 置き場所ごとの保存のキー（いままでの文字と同じ書式）", () => {
  assert.equal(dbSurfaceKey({ kind: "project", projectId: 12 }), "project-12");
  assert.equal(dbSurfaceKey({ kind: "side", projectId: 12 }), "side-12");
  assert.equal(dbSurfaceKey({ kind: "chat", chatId: 3 }), "chat-3");
});
