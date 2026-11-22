import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { browserTab } from "@/features/panel/ui";
import { browserTabKind } from "./tabKind";

// 中身の部品（webview）は読まない
vi.mock("./BrowserTabPage", () => ({ BrowserPage: () => null }));

test("名前: ブラウザはタイトル → ホスト → 「新しいタブ」。乗せると URL", () => {
  const page = { ...browserTab("https://example.com/a"), title: "" };
  assert.equal(browserTabKind.label(page, undefined), "example.com");
  assert.equal(browserTabKind.label(browserTab(), undefined), "新しいタブ");
  assert.equal(browserTabKind.hint?.(page), "https://example.com/a");
});

test("復元したタブだけ、欄を初めて開くまで中身を作らない", () => {
  assert.equal(browserTabKind.deferUntilPanelOpen?.({ ...browserTab("https://example.com"), restored: true }), true);
  assert.equal(browserTabKind.deferUntilPanelOpen?.(browserTab("https://example.com")), false);
});

test("外のブラウザで開くページ: いまのページ（なければ開いたときのページ）", () => {
  const page = browserTab("https://example.com");
  assert.equal(browserTabKind.externalUrl?.({ ...page, current: "https://example.com/docs" }), "https://example.com/docs");
  assert.equal(browserTabKind.externalUrl?.(page), "https://example.com");
});
