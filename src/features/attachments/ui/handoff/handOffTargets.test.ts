import assert from "node:assert/strict";
import { test } from "vitest";
import type { Chat } from "@shared/chat/types";
import { makeChat } from "@shared/foundation/testing/factories";
import { handOffChatOf, visibleHandOffTargets, type HandOffItem, type HandOffPlace, type HandOffTarget, type HandOffTargetId } from "./handOffTargets";

/** 足す先のチャットがあるときだけ出す渡し先（this・child の形）と、いつも出す渡し先 */
const target = (id: HandOffTargetId, needsChat: boolean, more: Partial<HandOffTarget> = {}): HandOffTarget => ({
  id,
  order: 0,
  label: ({ mainChat }) => (needsChat && !mainChat ? null : id),
  title: () => id,
  run: async () => {},
  ...more,
});
const targets = [target("new", false), target("this", true), target("child", true), target("other", false)];
const item: HandOffItem = { projectId: 1, what: "issue #1", text: "直して" };
const at = (mainChat: Chat | null, inner: HandOffPlace["inner"] = null): HandOffPlace => ({ mainChat, inner });

test("visibleHandOffTargets: 足す先のチャットがなければ this・child を出さない", () => {
  assert.deepEqual(visibleHandOffTargets(targets, item, at(null)).map((t) => t.id), ["new", "other"]);
  assert.deepEqual(visibleHandOffTargets(targets, item, at(makeChat(1))).map((t) => t.id), ["new", "this", "child", "other"]);
});

test("visibleHandOffTargets: 渡すものが隠す渡し先は出さない", () => {
  assert.deepEqual(visibleHandOffTargets(targets, { ...item, hide: ["new", "child"] }, at(makeChat(1))).map((t) => t.id), ["this", "other"]);
});

test("visibleHandOffTargets: パスの渡し先は item.path があるときだけ・一言も札もなければパスの渡し先だけ", () => {
  const withPath = [...targets, target("thisPath", true, { hands: "path" })];
  assert.deepEqual(visibleHandOffTargets(withPath, item, at(makeChat(1))).map((t) => t.id), ["new", "this", "child", "other"]);
  assert.deepEqual(visibleHandOffTargets(withPath, { ...item, path: "/r/a.ts" }, at(makeChat(1))).map((t) => t.id), ["new", "this", "child", "other", "thisPath"]);
  assert.deepEqual(visibleHandOffTargets(withPath, { ...item, text: "", path: "/r/a.ts" }, at(makeChat(1))).map((t) => t.id), ["thisPath"]);
});

test("handOffChatOf: chatOf がなければ足す先のチャット・あれば chatOf のチャット（右の欄の中の子チャット）", () => {
  const main = makeChat(1);
  const child = makeChat(2);
  const place = at(main, { chat: child, name: "子チャット" });
  assert.equal(handOffChatOf(target("this", true), place), main);
  assert.equal(handOffChatOf(target("inner", true, { chatOf: (p) => p.inner?.chat ?? null }), place), child);
});
