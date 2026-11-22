import assert from "node:assert/strict";
import { test } from "vitest";
import type { Chat } from "@shared/chat/types";
import { makeChat } from "@shared/foundation/testing/factories";
import { visibleHandOffTargets, type HandOffItem, type HandOffTarget, type HandOffTargetId } from "./handOffTargets";

/** 足す先のチャットがあるときだけ出す渡し先（this・child の形）と、いつも出す渡し先 */
const target = (id: HandOffTargetId, needsChat: boolean): HandOffTarget => ({
  id,
  order: 0,
  label: (mainChat: Chat | null) => (needsChat && !mainChat ? null : id),
  title: () => id,
  run: async () => {},
});
const targets = [target("new", false), target("this", true), target("child", true), target("other", false)];
const item: HandOffItem = { projectId: 1, what: "issue #1", text: "" };

test("visibleHandOffTargets: 足す先のチャットがなければ this・child を出さない", () => {
  assert.deepEqual(visibleHandOffTargets(targets, item, null).map((t) => t.id), ["new", "other"]);
  assert.deepEqual(visibleHandOffTargets(targets, item, makeChat(1)).map((t) => t.id), ["new", "this", "child", "other"]);
});

test("visibleHandOffTargets: 渡すものが隠す渡し先は出さない", () => {
  assert.deepEqual(visibleHandOffTargets(targets, { ...item, hide: ["new", "child"] }, makeChat(1)).map((t) => t.id), ["this", "other"]);
});
