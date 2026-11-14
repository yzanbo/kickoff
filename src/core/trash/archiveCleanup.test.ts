import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat } from "@shared/testing/factories";
import { cleanupBefore, staleArchivedFamilies } from "./archiveCleanup.js";

const OLD = "2026-01-01T00:00:00.000Z";
const NEW = "2026-11-10T00:00:00.000Z";
const BEFORE = "2026-06-01T00:00:00.000Z";

test("整理: アーカイブ済みで古いものを、子孫ごとの組にする（アーカイブしていない・新しい・作業中の子孫がいる組は外す）", () => {
  const chats = [
    makeChat(1, { archived_at: OLD, active_at: OLD }),
    makeChat(2, { archived_at: OLD, active_at: OLD, parent_chat_id: 1 }),
    // アーカイブしていない
    makeChat(3, { archived_at: null, active_at: OLD }),
    // 新しく動いた
    makeChat(4, { archived_at: OLD, active_at: NEW }),
    // 子が新しく動いた組は外す
    makeChat(5, { archived_at: OLD, active_at: OLD }),
    makeChat(6, { archived_at: OLD, active_at: NEW, parent_chat_id: 5 }),
    // 親がアーカイブしていない子チャットは、その子からの組
    makeChat(7, { archived_at: OLD, active_at: OLD, parent_chat_id: 3 }),
    // 作業中の子孫がいる組は外す
    makeChat(8, { archived_at: OLD, active_at: OLD }),
    makeChat(9, { archived_at: OLD, active_at: OLD, parent_chat_id: 8, status: "running" }),
  ];
  const families = staleArchivedFamilies(chats, BEFORE).map((f) => f.map((c) => c.id));
  assert.deepEqual(families, [[1, 2], [7]]);
});

test("整理: 日数から「それより前」の時刻", () => {
  assert.equal(cleanupBefore(30, Date.parse("2026-11-14T00:00:00.000Z")), "2026-10-15T00:00:00.000Z");
});
