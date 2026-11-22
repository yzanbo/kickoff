import assert from "node:assert/strict";
import { test } from "vitest";
import { allPanels, panelStateOf } from "@/features/panel/ui/state/panelStore";
import { useTestPanelStore } from "@/features/panel/ui/testing";
import { MOVING_TAB_MIMES, movingMimeFor, parseMovingTab, takeMovingTab } from "./tabTransfer";

test("ウィンドウをまたいで渡すタブ: ブラウザ・チャットの形がそろっていれば読み、形が合わなければ null", () => {
  const browser = { panel: "side:21", tab: { kind: "browser", key: "browser:1:abc", url: "https://example.com/", title: "Example" } } as const;
  const chat = { panel: "kanban:21", tab: { kind: "chat", key: "chat:7", id: 7, projectId: 21 } } as const;
  assert.deepEqual(parseMovingTab(JSON.stringify(browser)), browser);
  assert.deepEqual(parseMovingTab(JSON.stringify(chat)), chat);
  assert.equal(parseMovingTab(JSON.stringify({ ...chat, tab: { ...chat.tab, id: "7" } })), null);
  assert.equal(parseMovingTab(JSON.stringify({ panel: "x", tab: { kind: "terminal", key: "t" } })), null);
  assert.equal(parseMovingTab("{"), null);
});

test("送る前の新しいチャットのタブ: 下書きのキーだけを渡し（中身は下書きの店）、ほかの値は捨てる。チャットを出す欄が受ける", () => {
  const draft = { panel: "kanban:21", tab: { kind: "new", key: "new:1:abc" } } as const;
  assert.deepEqual(parseMovingTab(JSON.stringify(draft)), draft);
  assert.deepEqual(parseMovingTab(JSON.stringify({ ...draft, tab: { ...draft.tab, draftText: "書きかけ" } })), draft);
  assert.equal(parseMovingTab(JSON.stringify({ ...draft, tab: { kind: "new" } })), null);
  assert.equal(
    movingMimeFor([MOVING_TAB_MIMES.new], (k) => k === "chat"),
    MOVING_TAB_MIMES.new,
  );
});

test("受け取れるタブの型: 欄が出す種類の型だけ（チャットの欄はブラウザのタブを受けない）", () => {
  const types = ["text/plain", MOVING_TAB_MIMES.browser];
  assert.equal(
    movingMimeFor(types, (k) => k === "browser"),
    MOVING_TAB_MIMES.browser,
  );
  assert.equal(
    movingMimeFor(types, (k) => k === "chat"),
    null,
  );
});

test("ほかのウィンドウの欄から落とされたタブ: この欄に開き、元の欄はこのウィンドウの店に作らない", () => {
  useTestPanelStore();
  takeMovingTab("kanban:31", { panel: "cwin:win-31-chat:7", tab: { kind: "chat", key: "chat:7", id: 7, projectId: 31 } });
  assert.deepEqual(panelStateOf("kanban:31").tabs.map((t) => t.key), ["chat:7"]);
  assert.deepEqual([...allPanels().keys()], ["kanban:31"]);
});
