import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat } from "@shared/testing/factories";
import { closedLinks, NO_LINKS, openedLinks, syncLinkedTabs, type LinkState } from "./linkedTabs";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";

const chatTab = (id: number): PanelTab => ({ key: `chat:${id}`, kind: "chat", id, projectId: 1, title: `チャット${id}` });
const browser: PanelTab = { key: "browser:1", kind: "browser", url: "", title: "" };
const ids = (tabs: readonly PanelTab[]) => tabs.map((t) => t.key);
const links = (linked: number[], dismissed: number[] = [], extra: number[] = []): LinkState => ({ linked, dismissed, extra });

test("サイドバーとの連動: 一覧にあってタブのないチャットを一覧の並びで足し、一覧から外れたチャットのタブは閉じる", () => {
  const { tabs, links: next } = syncLinkedTabs([chatTab(1), browser, chatTab(9)], [makeChat(3), makeChat(1), makeChat(2)], NO_LINKS);
  assert.deepEqual(ids(tabs), ["chat:1", "browser:1", "chat:3", "chat:2"]);
  // 一覧の ID を覚える（開く・閉じるときに、サイドバーに出ているかを見る）
  assert.deepEqual([...next.linked].sort(), [1, 2, 3]);
});

test("サイドバーとの連動: 変わらなければ同じ配列と同じ覚えを返す（一覧の並びが変わっただけでも）", () => {
  const before = [chatTab(1), chatTab(2)];
  const known = links([1, 2], [2]);
  const next = syncLinkedTabs(before, [makeChat(2), makeChat(1)], known);
  assert.equal(next.tabs, before);
  assert.equal(next.links, known);
});

test("サイドバーとの連動: 表示だけ消したチャットは足さず、一覧から外れたら忘れる", () => {
  const first = syncLinkedTabs([chatTab(1)], [makeChat(1), makeChat(2)], links([], [2]));
  assert.deepEqual(ids(first.tabs), ["chat:1"]);
  const gone = syncLinkedTabs(first.tabs, [makeChat(1)], first.links);
  assert.deepEqual(gone.links.dismissed, []);
});

test("サイドバーとの連動: 一覧にないのに自分で開いたチャット（extra）は残し、一覧に入ったら extra から外す", () => {
  const kept = syncLinkedTabs([chatTab(1), chatTab(5)], [makeChat(1)], links([], [], [5]));
  assert.deepEqual(ids(kept.tabs), ["chat:1", "chat:5"]);
  const joined = syncLinkedTabs(kept.tabs, [makeChat(1), makeChat(5)], kept.links);
  assert.deepEqual(joined.links.extra, []);
  // extra でなくなったので、次に一覧から外れたら閉じる
  assert.deepEqual(ids(syncLinkedTabs(joined.tabs, [makeChat(1)], joined.links).tabs), ["chat:1"]);
});

test("サイドバーとの連動: 開いたチャットは表示だけ消した覚えを消し、一覧になければ extra に残す", () => {
  assert.deepEqual(openedLinks(links([1, 2], [2]), 2), links([1, 2], []));
  assert.deepEqual(openedLinks(links([1]), 7), links([1], [], [7]));
  // 変わらなければ同じ覚え
  const known = links([1]);
  assert.equal(openedLinks(known, 1), known);
});

test("サイドバーとの連動: 利用者が閉じたサイドバーのチャットだけ覚え、アーカイブ・削除のあと（dismiss: false）は覚えない", () => {
  assert.deepEqual(closedLinks(links([1, 2], [], [7]), [1, 7], true), links([1, 2], [1], []));
  assert.deepEqual(closedLinks(links([1, 2]), [1], false), links([1, 2]));
});
