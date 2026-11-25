import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import { acceptsProjectDrop } from "./projectChatDrop";

test("acceptsProjectDrop: ほかのプロジェクト（共通も）のチャットだけを受ける。同じプロジェクト・知らないチャットは受けない", () => {
  // プロジェクト 1 のチャットを、共通（ID 9）・ほかのプロジェクトへ / 共通のチャットをプロジェクトへ
  assert.equal(acceptsProjectDrop(makeChat(1, { project_id: 1 }), 9), true);
  assert.equal(acceptsProjectDrop(makeChat(1, { project_id: 1 }), 2), true);
  assert.equal(acceptsProjectDrop(makeChat(2, { project_id: 9 }), 1), true);
  assert.equal(acceptsProjectDrop(makeChat(1, { project_id: 1 }), 1), false);
  assert.equal(acceptsProjectDrop(undefined, 1), false);
});
