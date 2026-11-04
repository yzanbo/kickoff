import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatGroup } from "@shared/types";
import { groupNameIn, reduceGroups } from "./groups";

const group = (id: number, project_id: number, position: number) => ({ id, project_id, position, name: `g${id}` }) as ChatGroup;
const ids = (list: readonly ChatGroup[]) => list.map((g) => g.id);

test("reduceGroups: 作った・変えたグループは並び順（position → id）の位置へ。ほかのプロジェクトの知らせでは同じ一覧のまま", () => {
  const list = [group(1, 1, 0), group(2, 1, 1)];
  assert.deepEqual(ids(reduceGroups(list, { type: "group", group: group(3, 1, 0) }, 1)), [1, 3, 2]);
  assert.deepEqual(ids(reduceGroups(list, { type: "group", group: group(1, 1, 5) }, 1)), [2, 1]);
  assert.equal(reduceGroups(list, { type: "group", group: group(9, 2, 0) }, 1), list);
});

test("reduceGroups: 消したグループを外す（ないもの・ほかのプロジェクトのものなら同じ一覧のまま）", () => {
  const list = [group(1, 1, 0), group(2, 1, 1)];
  assert.deepEqual(ids(reduceGroups(list, { type: "group_deleted", id: 1, project_id: 1 }, 1)), [2]);
  assert.equal(reduceGroups(list, { type: "group_deleted", id: 7, project_id: 1 }, 1), list);
  assert.equal(reduceGroups(list, { type: "group_deleted", id: 1, project_id: 2 }, 1), list);
});

test("groupNameIn: グループなし・もうないグループは undefined", () => {
  const list = [group(1, 1, 0)];
  assert.equal(groupNameIn(list, 1), "g1");
  assert.equal(groupNameIn(list, 2), undefined);
  assert.equal(groupNameIn(list, null), undefined);
});
