import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import type { Chat } from "@shared/chat/types";
import { makeChat } from "@shared/foundation/testing/factories";
import type { PlacedDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { ChatRow } from "./ChatRow";
import { DraftRow } from "./DraftRows";

vi.mock("@/features/groups/ui/GroupChip", () => ({ GroupChip: () => null }));
vi.mock("@/foundation/ui/workplace/WorktreeChip", () => ({ WorktreeChip: () => null }));
vi.mock("@/features/chat/ui/currentWorkStore", () => ({ useChatActivity: () => null }));
vi.mock("@/foundation/ui/navigation/router", () => ({ href: () => "#chat", useRoute: () => ({ name: "project", id: 1, tab: "chats" }) }));
vi.mock("@/features/projects/ui/page/chatPlacement", () => ({ useChatPlacement: () => ["separate"] }));
vi.mock("@/features/chatPanel/ui/drafts/DraftMenuItems", () => ({ DraftMenuItems: () => null, DraftSplitItems: () => null, DraftTitleInput: () => null }));
vi.mock("@/features/chatPanel/ui/drafts/panelDrafts", () => ({ draftTitleOf: () => "New Chat", hasDraftAttachments: () => false, openDraft: () => {}, useAllDrafts: () => [] }));
vi.mock("@/foundation/ui/kit/PopupMenu", () => ({ PopupMenu: () => null }));

const renderChat = (patch: Partial<Chat>, rename = false) => renderToStaticMarkup(createElement(ChatRow, {
  chat: makeChat(1, patch), state: "unread", active: true,
  onMenu: () => {}, onRename: () => {},
  rename: rename ? { onSubmit: () => {}, onCancel: () => {} } : undefined,
}));

test("ピン留めしたチャットは薄い背景の対象となり、未読・選択中の印とピンを併記する", () => {
  const html = renderChat({ pinned: true });
  assert.match(html, /class="chat-row pinned active is-unread"/);
  assert.match(html, /aria-label="ピン留め中"/);
  assert.match(html, /data-chat-id="1"/);
});

test("通常・アーカイブ済みのチャットはピン留めの背景・印を出さない", () => {
  for (const patch of [{ pinned: false }, { pinned: true, archived_at: "2026-11-17" }]) {
    const html = renderChat(patch);
    assert.doesNotMatch(html, /class="chat-row pinned/);
    assert.doesNotMatch(html, /aria-label="ピン留め中"/);
  }
});

test("名前の変更中もピン留めの背景と区切り線の対象を維持する", () => {
  const html = renderChat({ pinned: true }, true);
  assert.match(html, /class="chat-row-item"/);
  assert.match(html, /class="chat-row renaming pinned active"/);
});

test("下書きもピン留めした行だけを同じ背景の対象にする", () => {
  for (const pinned of [false, true]) {
    const draft: PlacedDraft = { projectId: 1, panel: "board:1", key: "draft:1", text: "", showing: false, pinned };
    const html = renderToStaticMarkup(createElement(DraftRow, { draft }));
    assert.equal(html.includes('class="chat-row draft-row pinned"'), pinned);
    assert.equal(html.includes('aria-label="ピン留め中"'), pinned);
  }
});
