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

test("送る前の新しいチャットのタブ: 書きかけの文ごと渡し、作成先のプロジェクトがなければ読まない。チャットを出す欄が受ける", () => {
  const draft = { panel: "kanban:21", tab: { kind: "new", key: "new:1:abc", projectId: 21, draftText: "書きかけ", group: 3 } } as const;
  assert.deepEqual(parseMovingTab(JSON.stringify(draft)), draft);
  assert.equal(parseMovingTab(JSON.stringify({ ...draft, tab: { kind: "new", key: "new:1:abc" } })), null);
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
