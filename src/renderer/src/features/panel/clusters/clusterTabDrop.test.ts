import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat, makeGroup } from "@shared/testing/factories";
import type { BucketHead } from "@/features/chatList/buckets";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { clusterGroupOf, clusterTabDrop } from "./clusterTabDrop";
import { OTHER_CLUSTER } from "./tabClusters";

const g5: BucketHead = { key: "p1/g5", kind: "group", label: "実装", projectId: 1, group: makeGroup(5, { name: "実装" }) };
const none: BucketHead = { key: "p1/ungrouped", kind: "ungrouped", label: "No Group", projectId: 1 };
const chatTab = (id: number): PanelTab => ({ key: `chat:${id}`, kind: "chat", id, projectId: 1 });

test("clusterGroupOf: 自分で作ったグループはその ID、グループなしは null、ほかのまとまりは undefined", () => {
  assert.equal(clusterGroupOf(g5), 5);
  assert.equal(clusterGroupOf(none), null);
  assert.equal(clusterGroupOf({ key: "p1/pinned", kind: "pinned", label: "固定", projectId: 1 }), undefined);
  assert.equal(clusterGroupOf(OTHER_CLUSTER), undefined);
});

test("clusterTabDrop: チャットのタブはそのグループ・グループなしへ移す。同じグループ・子チャット・ほかのプロジェクトは移さない", () => {
  assert.deepEqual(clusterTabDrop(none, chatTab(3), makeChat(3, { group_id: 5 })), { kind: "chat", chatId: 3, groupId: null });
  assert.deepEqual(clusterTabDrop(g5, chatTab(3), makeChat(3, { group_id: null })), { kind: "chat", chatId: 3, groupId: 5 });
  assert.equal(clusterTabDrop(g5, chatTab(3), makeChat(3, { group_id: 5 })), null);
  assert.equal(clusterTabDrop(none, chatTab(3), makeChat(3, { group_id: null })), null);
  assert.equal(clusterTabDrop(none, chatTab(3), makeChat(3, { group_id: 5, parent_chat_id: 1 })), null);
  assert.equal(clusterTabDrop(none, chatTab(3), makeChat(3, { group_id: 5, project_id: 2 })), null);
  assert.equal(clusterTabDrop(none, chatTab(3), undefined), null);
  assert.equal(clusterTabDrop(OTHER_CLUSTER, chatTab(3), makeChat(3, { group_id: 5 })), null);
});

test("clusterTabDrop: 送る前の新しいチャットは作成先のグループを変える（同じ作成先・ほかのプロジェクトは変えない）。チャット以外のタブは移さない", () => {
  const draft = (group?: number, projectId = 1): PanelTab => ({ key: "new:1", kind: "new", projectId, group });
  assert.deepEqual(clusterTabDrop(none, draft(5), undefined), { kind: "draft", tabKey: "new:1", groupId: null, groupName: undefined });
  assert.deepEqual(clusterTabDrop(g5, draft(), undefined), { kind: "draft", tabKey: "new:1", groupId: 5, groupName: "実装" });
  assert.equal(clusterTabDrop(none, draft(), undefined), null);
  assert.equal(clusterTabDrop(g5, draft(undefined, 2), undefined), null);
  assert.equal(clusterTabDrop(none, { key: "browser:1", kind: "browser", url: "about:blank", title: "ブラウザ" }, undefined), null);
});
