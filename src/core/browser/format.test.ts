import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSnapshot, formatTabs, normalizeBrowserUrl, SNAPSHOT_TEXT_MAX } from "./format.js";

test("ブラウザの URL: 書いてあればそのまま、ローカルとポート付きは http、ほかは https。http(s) 以外は開かない", () => {
  assert.equal(normalizeBrowserUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(normalizeBrowserUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeBrowserUrl("localhost:5173/x"), "http://localhost:5173/x");
  assert.equal(normalizeBrowserUrl("127.0.0.1:8080"), "http://127.0.0.1:8080");
  assert.equal(normalizeBrowserUrl("example.com"), "https://example.com");
  assert.equal(normalizeBrowserUrl("  "), null);
  assert.equal(normalizeBrowserUrl("file:///etc/passwd"), null);
  assert.equal(normalizeBrowserUrl("javascript:alert(1)"), null);
});

test("タブの一覧: このプロジェクトのタブを先に、前に使ったタブ・読み込み中の印を添える", () => {
  const text = formatTabs(
    [
      { id: 3, project_id: 9, url: "https://a.test", title: "A", loading: false },
      { id: 5, project_id: 1, url: "http://localhost:3000", title: "", loading: true },
    ],
    1,
    5,
  );
  assert.deepEqual(text.split("\n"), ["- tab_id=5: (題なし) — http://localhost:3000（このプロジェクト・前に使ったタブ・読み込み中）", "- tab_id=3: A — https://a.test（ほかのプロジェクト）"]);
  assert.match(formatTabs([], 1, null), /browser_open/);
});

test("ページの読み取り: 要素は [ref] 種類 名前 → リンク先、長い文は切る", () => {
  const text = formatSnapshot(
    {
      url: "https://a.test",
      title: "A",
      elements: [
        { ref: 1, tag: "a", type: null, name: "Docs", href: "/docs" },
        { ref: 2, tag: "input", type: "text", name: "", href: null },
      ],
      text: "x".repeat(SNAPSHOT_TEXT_MAX + 5),
      scroll: { y: 0, height: 2000, viewport: 800 },
    },
    7,
  );
  assert.ok(text.startsWith("tab_id=7: A — https://a.test\nスクロール: 0 / 1200px"));
  assert.ok(text.includes("[1] a Docs → /docs\n[2] input[text] (名前なし)"));
  assert.ok(text.endsWith("（以下 5 文字を省略）"));
});
