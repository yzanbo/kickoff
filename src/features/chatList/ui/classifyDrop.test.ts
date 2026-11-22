import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { classifyDrop, DROP_KINDS, type DropKind } from "./classifyDrop";

const all = () => true;
const none = (kind: DropKind) => kind === "chat";

test("classifyDrop: 6 通り（同じプロジェクト・アーカイブ済み・下書き・ほかのプロジェクト・子チャット・知らないチャット）", () => {
  const at = (chat: Parameters<typeof classifyDrop>[0]["chat"], draft = false) => classifyDrop({ chat, draft, projectId: 1, handles: all });
  assert.equal(at(makeChat(1)), "chat");
  assert.equal(at(makeChat(2, { archived_at: "2026-01-01 00:00:00" })), "archived");
  assert.equal(at(undefined, true), "draft");
  assert.equal(at(makeChat(3, { project_id: 2 })), "foreign");
  assert.equal(at(makeChat(4, { parent_chat_id: 1 })), "child");
  assert.equal(at(undefined), "chat");
});

test("classifyDrop: 受けない種類は null（外側へ任せる）。アーカイブ済みを受けなければふつうのチャット", () => {
  const at = (chat: Parameters<typeof classifyDrop>[0]["chat"], draft = false) => classifyDrop({ chat, draft, projectId: 1, handles: none });
  assert.equal(at(undefined, true), null);
  assert.equal(at(makeChat(3, { project_id: 2 })), null);
  assert.equal(at(makeChat(4, { parent_chat_id: 1 })), null);
  assert.equal(at(makeChat(2, { archived_at: "2026-01-01 00:00:00" })), "chat");
});

test("classifyDrop: ほかのプロジェクトの子チャットは foreign（プロジェクトを先に見る）", () => {
  assert.equal(classifyDrop({ chat: makeChat(5, { project_id: 2, parent_chat_id: 9 }), draft: false, projectId: 1, handles: all }), "foreign");
  assert.deepEqual([...DROP_KINDS], ["chat", "archived", "draft", "foreign", "child"]);
});
