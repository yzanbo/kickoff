import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTabOrder, flatTabOrder, isNoopDrop, moveGroup, moveTabInGroup, orderAfterDrop } from "./tabOrder";

const t = (tab: string) => ({ tab });
const GROUPS = [
  { key: "work", tabs: [t("board"), t("chats")] },
  { key: "code", tabs: [t("files"), t("search"), t("changes")] },
  { key: "history", tabs: [t("history")] },
  { key: "memos", tabs: [t("memos")] },
];
const keys = (groups: { key: string; tabs: readonly { tab: string }[] }[]) => groups.map((g) => `${g.key}:${g.tabs.map((x) => x.tab).join(",")}`);

test("applyTabOrder: 覚えた並びでまとまりと中のタブを並べ、覚えていないものは初めの並びのまま後ろへ", () => {
  assert.deepEqual(keys(applyTabOrder(GROUPS, [])), ["work:board,chats", "code:files,search,changes", "history:history", "memos:memos"]);
  const saved = ["memos", "changes", "files", "search", "chats", "board"];
  assert.deepEqual(keys(applyTabOrder(GROUPS, saved)), ["memos:memos", "code:changes,files,search", "work:chats,board", "history:history"]);
});

test("moveTabInGroup: 同じまとまりの中だけで並べ替える", () => {
  assert.deepEqual(moveTabInGroup(GROUPS, "changes", "files", "before"), ["board", "chats", "changes", "files", "search", "history", "memos"]);
  assert.deepEqual(moveTabInGroup(GROUPS, "board", "chats", "after"), ["chats", "board", "files", "search", "changes", "history", "memos"]);
  // ほかのまとまりのタブには動かせない（並びは変わらない）
  assert.deepEqual(moveTabInGroup(GROUPS, "board", "files", "before"), flatTabOrder(GROUPS));
});

test("moveGroup: まとまりごと前・後ろへ動かす（中の並びはそのまま）", () => {
  assert.deepEqual(moveGroup(GROUPS, "code", "work", "before"), ["files", "search", "changes", "board", "chats", "history", "memos"]);
  assert.deepEqual(moveGroup(GROUPS, "work", "memos", "after"), ["files", "search", "changes", "history", "memos", "board", "chats"]);
  assert.deepEqual(moveGroup(GROUPS, "history", "history", "after"), flatTabOrder(GROUPS));
});

test("isNoopDrop: すぐ前の後ろ・すぐ後ろの前に落としても並びは変わらない（線を出さない）", () => {
  // まとまりの外: 3 番目（history）を 2 番目（code）の後ろ・4 番目（memos）の前へ
  assert.equal(isNoopDrop(GROUPS, { tab: "history", group: "history" }, { kind: "group", key: "code", side: "after" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: "history", group: "history" }, { kind: "group", key: "memos", side: "before" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: "history", group: "history" }, { kind: "group", key: "code", side: "before" }), false);
  assert.deepEqual(orderAfterDrop(GROUPS, { tab: "history", group: "history" }, { kind: "group", key: "code", side: "before" }), ["board", "chats", "history", "files", "search", "changes", "memos"]);
  // つまみでつかんだまとまり
  assert.equal(isNoopDrop(GROUPS, { tab: null, group: "code" }, { kind: "group", key: "work", side: "after" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: null, group: "code" }, { kind: "group", key: "memos", side: "after" }), false);
  // まとまりの中: search を files の後ろ・changes の前へ
  assert.equal(isNoopDrop(GROUPS, { tab: "search", group: "code" }, { kind: "tab", key: "files", side: "after" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: "search", group: "code" }, { kind: "tab", key: "changes", side: "before" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: "search", group: "code" }, { kind: "tab", key: "changes", side: "after" }), false);
});
