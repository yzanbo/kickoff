import assert from "node:assert/strict";
import { test } from "vitest";
import { MOVING_TAB_MIMES, movingMimeFor, parseMovingTab } from "./tabTransfer";

test("ウィンドウをまたいで渡すタブ: ブラウザ・チャットの形がそろっていれば読み、形が合わなければ null", () => {
  const browser = { panel: "side:21", tab: { kind: "browser", key: "browser:1:abc", url: "https://example.com/", title: "Example" } } as const;
  const chat = { panel: "kanban:21", tab: { kind: "chat", key: "chat:7", id: 7, projectId: 21 } } as const;
  assert.deepEqual(parseMovingTab(JSON.stringify(browser)), browser);
  assert.deepEqual(parseMovingTab(JSON.stringify(chat)), chat);
  assert.equal(parseMovingTab(JSON.stringify({ ...chat, tab: { ...chat.tab, id: "7" } })), null);
  assert.equal(parseMovingTab(JSON.stringify({ panel: "x", tab: { kind: "terminal", key: "t" } })), null);
  assert.equal(parseMovingTab("{"), null);
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
