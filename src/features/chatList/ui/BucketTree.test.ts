import assert from "node:assert/strict";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, test, vi } from "vitest";
import type { Chat } from "@shared/chat/types";
import { makeChat } from "@shared/chat/testing";
import { FOLD_ROW } from "@/foundation/ui/kit/FoldHead";
import type { HeadTable } from "./BucketTree";
import type { ChatBucket } from "./buckets";

// 開閉は覚えた値のない初めの形（アーカイブ済みだけ閉じる）
vi.mock("@/foundation/ui/hooks/useFold", () => ({ useFolds: () => ({ isOpen: (_key: string, defaultOpen = true) => defaultOpen, set: () => {} }) })); // test-rules-ignore: 開閉の覚えを初めの形にして部品を描く
// 同じプロセスで先に流れたファイルが本物の useFold で読み込んでいても、モックで読み直す（あとのファイルにも残さない）
vi.resetModules();
const { BucketTree } = await import("./BucketTree");
const { RowBudgetScope } = await import("@/foundation/ui/hooks/useProgressiveRows");
afterAll(() => vi.resetModules());

type Draft = { projectId: number; key: string; pinned: boolean };
const ZERO = { running: 0, needs_input: 0, unread: 0 };
const bucket = (key: string, kind: ChatBucket["kind"], chats: Chat[], extra: Partial<ChatBucket<Draft>> = {}): ChatBucket<Draft> => ({ key, kind, label: key, chats, drafts: [], counts: ZERO, ...extra });
const draft = (key: string, pinned: boolean): Draft => ({ projectId: 1, key, pinned });
const renderRow = (chat: Chat) => createElement("li", { key: chat.id, "data-row": chat.id }, chat.title);
const renderDrafts = (drafts: readonly Draft[]) => drafts.map((d) => createElement("i", { key: d.key, "data-draft": d.key }));
// グループは固定を小見出しの下に分ける（サイドバーと同じ形）。固定の小見出しは外のまとまりがあるときの形
const HEADS: HeadTable<Draft> = {
  group: (b) => ({ head: { look: FOLD_ROW, label: b.label }, pinnedApart: "after-pinned" }),
  status: (b) => ({ head: { look: FOLD_ROW, label: b.label }, pinnedApart: "after-pinned" }),
  pinned: (_b, { parent }) => (parent ? { head: null, wrap: null, bare: true, frame: (s: ReactNode) => createElement("section", { className: "pinned-head" }, s) } : null),
  archived: (b) => ({ head: { look: FOLD_ROW, label: b.label } }),
};
const render = (buckets: ChatBucket<Draft>[], budget = Number.POSITIVE_INFINITY) =>
  renderToStaticMarkup(createElement(RowBudgetScope, { value: budget }, createElement(BucketTree<Draft>, { buckets, heads: HEADS, renderRow, renderDrafts, place: "test" })));

test("BucketTree: 固定の小見出しの下に固定した行と下書きを並べ、通常の行と下書きは後ろの要素に置く", () => {
  const html = render([bucket("p1/g1", "group", [makeChat(1, { pinned: true }), makeChat(2)], { drafts: [draft("pin", true), draft("rest", false)] })]);
  assert.ok(html.indexOf("pinned-head") < html.indexOf('data-draft="pin"'));
  assert.ok(html.indexOf('data-draft="pin"') < html.indexOf('data-row="1"'));
  assert.ok(html.indexOf('data-row="1"') < html.indexOf("after-pinned"));
  assert.ok(html.indexOf("after-pinned") < html.indexOf('data-draft="rest"'));
  assert.ok(html.indexOf('data-draft="rest"') < html.indexOf('data-row="2"'));
});

test("BucketTree: 固定がなければ小見出しを出さず、固定だけなら後ろの要素を出さない（アーカイブ済みは固定に数えない）", () => {
  for (const chats of [[makeChat(1)], [makeChat(1, { pinned: true, archived_at: "x" })]]) assert.doesNotMatch(render([bucket("p1/g1", "group", chats)]), /pinned-head|after-pinned/);
  const pinnedOnly = render([bucket("p1/g1", "group", [makeChat(1, { pinned: true })])]);
  assert.match(pinnedOnly, /pinned-head/);
  assert.doesNotMatch(pinnedOnly, /after-pinned/);
});

test("BucketTree: 状態順でも中の段の「固定」は重ねず、残りの段を描く", () => {
  const pin = makeChat(1, { pinned: true });
  const rest = makeChat(2);
  const html = render([bucket("p1/g1", "group", [pin, rest], { children: [bucket("p1/g1/pinned", "pinned", [pin]), bucket("p1/g1/status:read", "status", [rest])] })]);
  assert.equal(html.match(/data-row="1"/g)?.length, 1);
  assert.equal(html.match(/pinned-head/g)?.length, 1);
  assert.match(html, /p1\/g1\/status:read/);
});

test("BucketTree: 最初に描く行の上限を上から並ぶ順に配り、閉じているまとまり（アーカイブ済みは初めは閉じる）には配らない", () => {
  const html = render(
    [
      bucket("p1/g1", "group", [makeChat(1), makeChat(2)]),
      bucket("p1/archived", "archived", [makeChat(3, { archived_at: "x" })]),
      bucket("p1/g2", "group", [makeChat(4), makeChat(5)]),
    ],
    3,
  );
  assert.match(html, /data-row="1"/);
  assert.match(html, /data-row="2"/);
  assert.doesNotMatch(html, /data-row="3"/);
  assert.match(html, /data-row="4"/);
  assert.doesNotMatch(html, /data-row="5"/);
});

test("BucketTree: 固定と通常に分けても、まとまりの上限は 1 つ", () => {
  const html = render([bucket("p1/g1", "group", [makeChat(1, { pinned: true }), makeChat(2, { pinned: true }), makeChat(3)])], 1);
  assert.equal(html.match(/data-row=/g)?.length, 1);
  assert.match(html, /data-row="1"/);
});
