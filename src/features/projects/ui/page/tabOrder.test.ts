import assert from "node:assert/strict";
import { test } from "vitest";
import { applyTabOrder, flatTabOrder, isNoopDrop, mergeSubsetOrder, moveGroup, moveTabInGroup, orderAfterDrop } from "./tabOrder";

const t = (tab: string) => ({ tab });
const GROUPS = [
  { key: "work", tabs: [t("board"), t("chats")] },
  { key: "code", tabs: [t("files"), t("search"), t("changes")] },
  { key: "history", tabs: [t("history")] },
  { key: "notes", tabs: [t("notes")] },
];
const keys = (groups: { key: string; tabs: readonly { tab: string }[] }[]) => groups.map((g) => `${g.key}:${g.tabs.map((x) => x.tab).join(",")}`);

test("applyTabOrder: 覚えた並びでまとまりと中のタブを並べ、覚えていないものは初めの並びのまま後ろへ", () => {
  assert.deepEqual(keys(applyTabOrder(GROUPS, [])), ["work:board,chats", "code:files,search,changes", "history:history", "notes:notes"]);
  const saved = ["notes", "changes", "files", "search", "chats", "board"];
  assert.deepEqual(keys(applyTabOrder(GROUPS, saved)), ["notes:notes", "code:changes,files,search", "work:chats,board", "history:history"]);
});

test("moveTabInGroup: 同じまとまりの中だけで並べ替える", () => {
  assert.deepEqual(moveTabInGroup(GROUPS, "changes", "files", "before"), ["board", "chats", "changes", "files", "search", "history", "notes"]);
  assert.deepEqual(moveTabInGroup(GROUPS, "board", "chats", "after"), ["chats", "board", "files", "search", "changes", "history", "notes"]);
  // ほかのまとまりのタブには動かせない（並びは変わらない）
  assert.deepEqual(moveTabInGroup(GROUPS, "board", "files", "before"), flatTabOrder(GROUPS));
});

test("moveGroup: まとまりごと前・後ろへ動かす（中の並びはそのまま）", () => {
  assert.deepEqual(moveGroup(GROUPS, "code", "work", "before"), ["files", "search", "changes", "board", "chats", "history", "notes"]);
  assert.deepEqual(moveGroup(GROUPS, "work", "notes", "after"), ["files", "search", "changes", "history", "notes", "board", "chats"]);
  assert.deepEqual(moveGroup(GROUPS, "history", "history", "after"), flatTabOrder(GROUPS));
});

test("isNoopDrop: すぐ前の後ろ・すぐ後ろの前に落としても並びは変わらない（線を出さない）", () => {
  // まとまりの外: 3 番目（history）を 2 番目（code）の後ろ・4 番目（notes）の前へ
  assert.equal(isNoopDrop(GROUPS, { tab: "history", group: "history" }, { kind: "group", key: "code", side: "after" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: "history", group: "history" }, { kind: "group", key: "notes", side: "before" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: "history", group: "history" }, { kind: "group", key: "code", side: "before" }), false);
  assert.deepEqual(orderAfterDrop(GROUPS, { tab: "history", group: "history" }, { kind: "group", key: "code", side: "before" }), ["board", "chats", "history", "files", "search", "changes", "notes"]);
  // つまみでつかんだまとまり
  assert.equal(isNoopDrop(GROUPS, { tab: null, group: "code" }, { kind: "group", key: "work", side: "after" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: null, group: "code" }, { kind: "group", key: "notes", side: "after" }), false);
  // まとまりの中: search を files の後ろ・changes の前へ
  assert.equal(isNoopDrop(GROUPS, { tab: "search", group: "code" }, { kind: "tab", key: "files", side: "after" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: "search", group: "code" }, { kind: "tab", key: "changes", side: "before" }), true);
  assert.equal(isNoopDrop(GROUPS, { tab: "search", group: "code" }, { kind: "tab", key: "changes", side: "after" }), false);
});

test("mergeSubsetOrder: 一部だけを並べ替えた並びを全体に戻し、ほかのタブ（ボード・チャット）は場所を変えない", () => {
  const full = flatTabOrder(GROUPS);
  // 右端の列（ボード・チャットなし）で、ノートをコードの前へ
  const rail = GROUPS.filter((g) => g.key !== "work");
  const reordered = moveGroup(rail, "notes", "code", "before");
  const merged = mergeSubsetOrder(full, reordered);
  assert.deepEqual(merged, ["board", "chats", "notes", "files", "search", "changes", "history"]);
  assert.deepEqual(keys(applyTabOrder(GROUPS, merged)), ["work:board,chats", "notes:notes", "code:files,search,changes", "history:history"]);
  // ボード・チャットが間にあっても、読むときにまとまりは続けて並ぶ
  const middle = flatTabOrder(applyTabOrder(GROUPS, ["files", "search", "changes", "board", "chats", "history", "notes"]));
  const moved = mergeSubsetOrder(middle, moveGroup(applyTabOrder(rail, middle), "notes", "code", "before"));
  assert.deepEqual(keys(applyTabOrder(GROUPS, moved)), ["notes:notes", "code:files,search,changes", "work:board,chats", "history:history"]);
});
