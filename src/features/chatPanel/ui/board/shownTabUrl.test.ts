import { test } from "vitest";
import assert from "node:assert/strict";
import { shouldFollowShownTab } from "./shownTabUrl";

const chats = { name: "project", id: 1, tab: "chats" } as const;

test("表示中のタブが変わったら URL にする（はじめて描いたとき・同じタブ・閉じたときは変えない）", () => {
  assert.equal(shouldFollowShownTab({ prev: "a", shown: "b", projectId: 1, current: chats }), true);
  assert.equal(shouldFollowShownTab({ prev: "a", shown: "b", projectId: 1, current: { name: "chat", projectId: 1, chatId: 3 } }), true);
  assert.equal(shouldFollowShownTab({ prev: undefined, shown: "b", projectId: 1, current: chats }), false);
  assert.equal(shouldFollowShownTab({ prev: "b", shown: "b", projectId: 1, current: chats }), false);
  assert.equal(shouldFollowShownTab({ prev: "b", shown: null, projectId: 1, current: chats }), false);
});

test("URL がもうほかのプロジェクトの画面なら変えない（下書きを別のプロジェクトへ移したとき、移る先の画面を元のチャットで上書きしない）", () => {
  assert.equal(shouldFollowShownTab({ prev: "draft", shown: "chat:5", projectId: 1, current: { name: "project", id: 2, tab: "chats" } }), false);
  assert.equal(shouldFollowShownTab({ prev: "draft", shown: "chat:5", projectId: 1, current: { name: "allProjects" } }), false);
});
