import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import { chatRowClass, draftRowClass, showsPinned } from "./chatRowClass";

test("ピン留めしたチャットは薄い背景の対象となり、未読・選択中の印と併記する", () => {
  assert.equal(showsPinned(makeChat(1, { pinned: true })), true);
  assert.equal(chatRowClass({ pinned: true, active: true, bold: true }), "chat-row pinned active is-unread");
  assert.equal(chatRowClass({ pinned: false, active: false, archived: true, selected: true }), "chat-row archived multi-selected");
});

test("通常・アーカイブ済みのチャットはピン留めの背景・印を出さない", () => {
  assert.equal(showsPinned(makeChat(1, { pinned: false })), false);
  assert.equal(showsPinned(makeChat(1, { pinned: true, archived_at: "2026-11-17" })), false);
  assert.equal(chatRowClass({ pinned: false, active: true }), "chat-row active");
});

test("名前の変更中もピン留めの背景と選択中の対象を維持する（ほかの印は付けない）", () => {
  assert.equal(chatRowClass({ pinned: true, active: true, renaming: true, bold: true, selected: true }), "chat-row renaming pinned active");
});

test("下書きもピン留めした行だけを同じ背景の対象にする", () => {
  assert.equal(draftRowClass({ pinned: false, selected: false }), "chat-row draft-row");
  assert.equal(draftRowClass({ pinned: true, selected: false }), "chat-row draft-row pinned");
  assert.equal(draftRowClass({ pinned: true, selected: true, renaming: true }), "chat-row draft-row renaming pinned active");
});
