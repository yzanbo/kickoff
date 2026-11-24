import assert from "node:assert/strict";
import { test } from "vitest";
import type { Chat } from "@shared/chat/types";
import { makeChat } from "@shared/chat/testing";
import { allocateRows } from "@/foundation/ui/lib/progressive";
import type { ChatBucket } from "./buckets";
import { bucketOpen, splitPinned } from "./bucketTreeModel";

type Draft = { projectId: number; key: string; pinned: boolean };
const ZERO = { running: 0, needs_input: 0, unread: 0 };
const bucket = (key: string, kind: ChatBucket["kind"], chats: Chat[], extra: Partial<ChatBucket<Draft>> = {}): ChatBucket<Draft> => ({ key, kind, label: key, chats, drafts: [], counts: ZERO, ...extra });
const draft = (key: string, pinned: boolean): Draft => ({ projectId: 1, key, pinned });
const ids = (chats: readonly Chat[]) => chats.map((c) => c.id);

test("固定の小見出しのまとまりに固定した行と下書きを入れ、通常の行と下書きは残りに置く", () => {
  const split = splitPinned(bucket("p1/g1", "group", [makeChat(1, { pinned: true }), makeChat(2)], { drafts: [draft("pin", true), draft("rest", false)] }));
  assert.equal(split.pinned.key, "p1/g1/pinned");
  assert.equal(split.pinned.kind, "pinned");
  assert.deepEqual(ids(split.pinned.chats), [1]);
  assert.deepEqual(split.pinned.drafts.map((d) => d.key), ["pin"]);
  assert.deepEqual(ids(split.regularChats), [2]);
  assert.deepEqual(split.regularDrafts.map((d) => d.key), ["rest"]);
});

test("固定がなければ小見出しを出さず、固定だけなら残りを出さない（アーカイブ済みは固定に数えない）", () => {
  for (const chats of [[makeChat(1)], [makeChat(1, { pinned: true, archived_at: "x" })]]) assert.equal(splitPinned(bucket("p1/g1", "group", chats)).hasPinned, false);
  const pinnedOnly = splitPinned(bucket("p1/g1", "group", [makeChat(1, { pinned: true })]));
  assert.equal(pinnedOnly.hasPinned, true);
  assert.equal(pinnedOnly.hasRegular, false);
});

test("状態順でも中の段の「固定」は重ねず、残りの段を描く", () => {
  const pin = makeChat(1, { pinned: true });
  const rest = makeChat(2);
  const split = splitPinned(bucket("p1/g1", "group", [pin, rest], { children: [bucket("p1/g1/pinned", "pinned", [pin]), bucket("p1/g1/status:read", "status", [rest])] }));
  assert.deepEqual(split.regularSections?.map((b) => b.key), ["p1/g1/status:read"]);
  assert.equal(split.pinned.children, undefined);
});

test("最初に描く行の上限を上から並ぶ順に配り、閉じているまとまり（アーカイブ済みは初めは閉じる）には配らない", () => {
  const buckets = [bucket("p1/g1", "group", [makeChat(1), makeChat(2)]), bucket("p1/archived", "archived", [makeChat(3, { archived_at: "x" })]), bucket("p1/g2", "group", [makeChat(4), makeChat(5)])];
  const fresh = (_key: string, defaultOpen: boolean) => defaultOpen;
  const open = buckets.map((b) => bucketOpen(b, false, fresh));
  assert.deepEqual(open, [true, false, true]);
  assert.deepEqual(allocateRows(buckets.map((b, i) => (open[i] ? b.chats.length : 0)), 3), [2, 0, 1]);
  // まとめない all と絞り込み中は、いつも開く
  assert.equal(bucketOpen(bucket("all", "all", []), false, () => false), true);
  assert.equal(bucketOpen(buckets[1], true, fresh), true);
});

test("固定と通常に分けても、まとまりの上限は 1 つ", () => {
  const split = splitPinned(bucket("p1/g1", "group", [makeChat(1, { pinned: true }), makeChat(2, { pinned: true }), makeChat(3)]));
  assert.deepEqual(allocateRows([split.pinned.chats.length, split.regularChats.length], 1), [1, 0]);
});
