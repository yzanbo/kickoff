import assert from "node:assert/strict";
import { test } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { panelTabs, type TransferredTab } from "@/features/panel/ui/kind";
import { allPanels, panelStateOf } from "@/features/panel/ui/state/panelStore";
import { testTabKind, useTestPanelStore } from "@/features/panel/ui/testing";
import { movingMimeFor, movingMimeOf, parseMovingTab, takeMovingTab } from "./tabTransfer";

// 移せる種類（本物はブラウザ = browser、チャット・新しいチャット = chatPanel が transfer を持つ。ここでは受け渡しの仕組みだけを確かめる）
const kinds = [
  testTabKind("browser", {
    transfer: {
      save: (t) => ({ kind: "browser", key: t.key, url: t.url, title: t.title }),
      load: (v: TransferredTab) => (typeof v.url === "string" && typeof v.title === "string" ? { kind: "browser", key: v.key, url: v.url, title: v.title } : null),
      shownAs: "browser",
    },
  }),
  testTabKind("chat", {
    transfer: {
      save: (t) => ({ kind: "chat", key: t.key, id: t.id, projectId: t.projectId }),
      load: (v: TransferredTab) => (typeof v.id === "number" && typeof v.projectId === "number" ? { kind: "chat", key: v.key, id: v.id, projectId: v.projectId } : null),
      shownAs: "chat",
      dismiss: true,
    },
  }),
  testTabKind("new", { transfer: { save: (t) => ({ kind: "new", key: t.key }), load: (v: TransferredTab) => ({ kind: "new", key: v.key }), shownAs: "chat" } }),
];
const install = () => {
  useTestContributions(kinds.map((k) => panelTabs.item(k)));
  useTestPanelStore({ kinds });
};

test("ウィンドウをまたいで渡すタブ: 種類の transfer で読み、知らない種類・形が合わなければ null", () => {
  install();
  const browser = { panel: "side:21", tab: { kind: "browser", key: "browser:1:abc", url: "https://example.com/", title: "Example" } } as const;
  const chat = { panel: "kanban:21", tab: { kind: "chat", key: "chat:7", id: 7, projectId: 21 } } as const;
  assert.deepEqual(parseMovingTab(JSON.stringify(browser)), browser);
  assert.deepEqual(parseMovingTab(JSON.stringify(chat)), chat);
  assert.equal(parseMovingTab(JSON.stringify({ ...chat, tab: { ...chat.tab, id: "7" } })), null);
  assert.equal(parseMovingTab(JSON.stringify({ panel: "x", tab: { kind: "terminal", key: "t" } })), null);
  assert.equal(parseMovingTab(JSON.stringify({ panel: "x", tab: { kind: "new" } })), null);
  assert.equal(parseMovingTab("{"), null);
});

test("受け取れるタブの型: 欄が出す種類の型だけ（新しいチャットはチャットを出す欄が受け、チャットの欄はブラウザのタブを受けない）", () => {
  install();
  assert.equal(movingMimeFor([movingMimeOf("new")], (k) => k === "chat"), movingMimeOf("new"));
  const types = ["text/plain", movingMimeOf("browser")];
  assert.equal(movingMimeFor(types, (k) => k === "browser"), movingMimeOf("browser"));
  assert.equal(movingMimeFor(types, (k) => k === "chat"), null);
});

test("ほかのウィンドウの欄から落とされたタブ: この欄に開き、元の欄はこのウィンドウの店に作らない", () => {
  install();
  takeMovingTab("kanban:31", { panel: "cwin:win-31-chat:7", tab: { kind: "chat", key: "chat:7", id: 7, projectId: 31 } });
  assert.deepEqual(panelStateOf("kanban:31").tabs.map((t) => t.key), ["chat:7"]);
  assert.deepEqual([...allPanels().keys()], ["kanban:31"]);
});
