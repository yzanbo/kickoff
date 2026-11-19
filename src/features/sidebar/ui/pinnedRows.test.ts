import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import type { Chat } from "@shared/types";
import { makeChat } from "@shared/foundation/testing/factories";
import type { PanelDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { ChatRow } from "./ChatRow";
import { DraftRow } from "./DraftRows";
import { BucketChatRows } from "./BucketChatRows";
import type { ChatBucket } from "@/features/chatList/ui/buckets";
import { RowBudgetScope } from "@/foundation/ui/hooks/useProgressiveRows";

vi.mock("@/features/groups/ui/groups", () => ({ startChatDrag: () => {}, startDraftDrag: () => {} }));
vi.mock("@/features/groups/ui/GroupChip", () => ({ GroupChip: () => null }));
vi.mock("@/foundation/ui/workplace/WorktreeChip", () => ({ WorktreeChip: () => null }));
vi.mock("@/features/chat/ui/currentWorkStore", () => ({ useChatActivity: () => null }));
vi.mock("@/foundation/ui/navigation/router", () => ({ href: () => "#chat", openChat: () => {}, useRoute: () => ({ name: "project", id: 1, tab: "chats" }) }));
vi.mock("@/features/projects/ui/page/chatPlacement", () => ({ useChatPlacement: () => ["separate"] }));
vi.mock("@/features/chatPanel/ui/drafts/DraftMenuItems", () => ({ DraftMenuItems: () => null, DraftSplitItems: () => null, DraftTitleInput: () => null }));
vi.mock("@/features/chatPanel/ui/drafts/panelDrafts", () => ({ draftTitleOf: () => "New Chat", openDraft: () => {}, useAllDrafts: () => [] }));
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
    const draft: PanelDraft = { projectId: 1, panel: "board:1", key: "draft:1", text: "", showing: false, pinned };
    const html = renderToStaticMarkup(createElement(DraftRow, { draft }));
    assert.equal(html.includes('class="chat-row draft-row pinned"'), pinned);
    assert.equal(html.includes('aria-label="ピン留め中"'), pinned);
  }
});

const renderRow = (chat: Chat) => createElement("li", { key: chat.id, "data-row": chat.id }, chat.title);
const draft = (key: string, pinned: boolean): PanelDraft => ({ projectId: 1, panel: "board:1", key, text: "", showing: false, pinned });
const renderBucket = (chats: Chat[], drafts: PanelDraft[] = []) => renderToStaticMarkup(createElement(BucketChatRows, { chats, drafts, renderRow }));

test("固定の小見出しの下に固定した行を並べ、通常の行は区切り線の後ろに置く", () => {
  const html = renderBucket([makeChat(1, { pinned: true }), makeChat(2, { pinned: true }), makeChat(3)]);
  assert.match(html, /class="sidebar-pinned-head"/);
  assert.match(html, /lucide-pin/);
  assert.match(html, /<span>固定<\/span>/);
  assert.ok(html.indexOf("sidebar-pinned-head") < html.indexOf('data-row="1"'));
  assert.ok(html.indexOf('data-row="2"') < html.indexOf("sidebar-after-pinned"));
  assert.ok(html.indexOf("sidebar-after-pinned") < html.indexOf('data-row="3"'));
});

test("固定なし・アーカイブ済みだけなら小見出しと区切り線を出さない。固定だけなら区切り線を出さない", () => {
  for (const chats of [[], [makeChat(1)], [makeChat(1, { pinned: true, archived_at: "x" })]]) {
    const html = renderBucket(chats);
    assert.doesNotMatch(html, /sidebar-pinned-head|sidebar-after-pinned/);
  }
  const pinnedOnly = renderBucket([makeChat(1, { pinned: true })]);
  assert.match(pinnedOnly, /sidebar-pinned-head/);
  assert.doesNotMatch(pinnedOnly, /sidebar-after-pinned/);
});

test("固定した下書きも同じ小見出しにまとめ、通常の下書きを固定チャットより上に出さない", () => {
  const html = renderBucket([makeChat(1, { pinned: true })], [draft("pinned", true), draft("regular", false)]);
  assert.equal(html.match(/sidebar-pinned-head/g)?.length, 1);
  assert.ok(html.indexOf("New Chat") < html.indexOf('data-row="1"'));
  assert.ok(html.indexOf('data-row="1"') < html.indexOf("sidebar-after-pinned"));
  assert.ok(html.lastIndexOf("New Chat") > html.indexOf("sidebar-after-pinned"));
  assert.match(renderBucket([], [draft("only", true)]), /sidebar-pinned-head/);
});

test("状態順でも固定の見出し・チャットを二重に描かず、残りの状態見出しを保つ", () => {
  const pin = makeChat(1, { pinned: true });
  const regular = makeChat(2);
  const section = (kind: ChatBucket["kind"], chats: Chat[]): ChatBucket => ({ key: kind, kind, label: kind, chats, drafts: [], counts: { running: 0, needs_input: 0, unread: 0 } });
  const html = renderToStaticMarkup(createElement(BucketChatRows, {
    chats: [pin, regular],
    sections: [section("pinned", [pin]), section("status", [regular])],
    renderRow,
    renderSections: (sections) => sections.map((s) => createElement("div", { key: s.key, "data-section": s.kind }, s.chats.map(renderRow))),
  }));
  assert.equal(html.match(/sidebar-pinned-head/g)?.length, 1);
  assert.equal(html.match(/data-row="1"/g)?.length, 1);
  assert.doesNotMatch(html, /data-section="pinned"/);
  assert.match(html, /data-section="status"/);
});

test("固定と通常を分けても初期描画の行数は元の上限を超えない", () => {
  const html = renderToStaticMarkup(createElement(RowBudgetScope, { value: 1 }, createElement(BucketChatRows, {
    chats: [makeChat(1, { pinned: true }), makeChat(2, { pinned: true }), makeChat(3)], renderRow,
  })));
  assert.equal(html.match(/data-row=/g)?.length, 1);
  assert.match(html, /data-row="1"/);
  assert.equal(html.match(/progressive-spacer/g)?.length, 2);
});
