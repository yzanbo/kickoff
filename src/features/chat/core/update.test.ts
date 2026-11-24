import assert from "node:assert/strict";
import { test } from "vitest";
import { Conflict } from "@/foundation/core/errors";
import { testStore } from "@/app/core/testing/testStore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { applyChatUpdate, ChatUpdateRefused, planChatUpdate } from "./update";

/** 店に、親 ─ 子 と、このプロジェクトとほかのプロジェクトのグループを用意する */
function setup(busy: number[] = []) {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: tempDir(), provider: "claude" });
  const other = store.projects.create({ name: "q", repo_path: tempDir(), provider: "claude" });
  const group = store.groups.create(project.id, "g");
  const otherGroup = store.groups.create(other.id, "h");
  const parent = store.chats.create({ project_id: project.id, provider: "claude", title: "親", status: "completed" });
  const child = store.chats.create({ project_id: project.id, provider: "claude", title: "子", status: "completed", parent_chat_id: parent.id });
  const d = {
    store,
    requireIdle: (id: number) => {
      if (busy.includes(id)) throw new Conflict("作業中");
    },
  };
  return { store, d, group, otherGroup, parent, child };
}

/** 断った理由（断らなければ null） */
function refusalOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ChatUpdateRefused) return e.kind;
    throw e;
  }
}

test("planChatUpdate: 名前は前後の空白を除き、空・長すぎる・子チャットのグループ・ないグループ・ほかのプロジェクトのグループを断る", () => {
  const { d, group, otherGroup, parent, child } = setup();
  assert.equal(refusalOf(() => planChatUpdate(d, parent, { title: "  " })), "title_empty");
  assert.equal(refusalOf(() => planChatUpdate(d, parent, { title: "あ".repeat(201) })), "title_long");
  assert.equal(refusalOf(() => planChatUpdate(d, child, { groupId: group.id })), "child_group");
  // 子チャットに null（外す）は、AI の決まりのときだけ断る。親から外して親のないチャットにするなら入れられる
  assert.deepEqual(planChatUpdate(d, child, { groupId: null }), { target: child });
  assert.equal(refusalOf(() => planChatUpdate(d, child, { groupId: null }, { strictChildGroup: true })), "child_group");
  assert.equal(planChatUpdate(d, child, { groupId: group.id }, { becomesRoot: true }).group?.id, group.id);
  assert.equal(refusalOf(() => planChatUpdate(d, parent, { groupId: 9999 })), "group_missing");
  assert.equal(refusalOf(() => planChatUpdate(d, parent, { groupId: otherGroup.id })), "group_other_project");
});

test("applyChatUpdate: 値が同じ項目は変えず、変えたことを返す。アーカイブは子孫ごとで、作業中の子孫がいれば確かめの段で断る", () => {
  const { store, d, group, parent } = setup();
  const { chat, changes } = applyChatUpdate(store.chats, planChatUpdate(d, parent, { title: " 新しい名前 ", pinned: false, groupId: group.id }));
  assert.deepEqual([chat.title, chat.group_id], ["新しい名前", group.id]);
  assert.deepEqual(changes.map((c) => c.kind), ["group", "title"]);
  const busy = setup([2]);
  assert.throws(() => planChatUpdate(busy.d, busy.parent, { archived: true }), Conflict);
  applyChatUpdate(store.chats, planChatUpdate(d, parent, { archived: true }));
  assert.ok(store.chats.get(parent.id)?.archived_at !== null);
});
