import assert from "node:assert/strict";
import { test } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { useChatPanelTestStore } from "./testing";
import { childTab, openTab, setPanelOpen } from "@/features/panel/ui";
import { chatSidePanel } from "@/features/chat/ui";
import { openNewChat, placedDrafts } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { followedPanels, panelFollow, panelFollowSnapshot, type PanelFollowSnapshot } from "./panelFollow";

installMemoryStorage();

test("写し: メインのウィンドウは下書きのタブの欄・位置と、開いている右の欄で見えている子チャットだけを送る", () => {
  useChatPanelTestStore();
  const draft = openNewChat("kanban:7", { projectId: 7 });
  openTab(chatSidePanel(5), childTab({ chatId: 5, childId: 51, projectId: 7, title: "子" }));
  setPanelOpen(chatSidePanel(5), true);
  openTab(chatSidePanel(6), childTab({ chatId: 6, childId: 61, projectId: 7, title: "閉じた欄の子" }));
  setPanelOpen(chatSidePanel(6), false);
  const snapshot = panelFollowSnapshot();
  assert.deepEqual(snapshot, {
    drafts: [{ key: draft, panel: "kanban:7", showing: true }],
    spots: { [draft]: { chatIds: [], before: 0 } },
    children: { 5: [51] },
  });
  // 知らせに載せるので JSON にしても同じ
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test("写し: 受けている間、下書きの置き場所は届いた写しから読み、やめたらこのウィンドウのパネルに戻る", () => {
  useChatPanelTestStore();
  // 下書きの店は localStorage でウィンドウどうし同じ。置き場所だけを写しで受ける
  const draft = openNewChat("kanban:8", { projectId: 8 });
  const sent: PanelFollowSnapshot = { drafts: [{ key: draft, panel: "kanban:9", showing: false }], spots: {}, children: { 3: [31] } };
  const end = panelFollow.begin();
  try {
    // 届くまでは空
    assert.deepEqual(placedDrafts(), []);
    panelFollow.apply(sent);
    assert.deepEqual(
      placedDrafts().map((d) => [d.key, d.panel, d.showing]),
      [[draft, "kanban:9", false]],
    );
    assert.equal(followedPanels(), sent);
  } finally {
    end();
  }
  assert.equal(followedPanels(), null);
  assert.deepEqual(
    placedDrafts().map((d) => [d.key, d.panel]),
    [[draft, "kanban:8"]],
  );
});
