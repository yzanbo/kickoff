import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSize, truncateText } from "./truncate";

const size = (s: string) => new TextEncoder().encode(s).byteLength;

test("truncateText: 上限以下ならそのまま", () => {
  assert.deepEqual(truncateText("abc", 3), { text: "abc", truncated: false, originalSize: 3 });
});

test("truncateText: 頭と終わりを残し、省いた量の印を入れて上限に収める", () => {
  const text = `${"a".repeat(1000)}${"b".repeat(1000)}`;
  const result = truncateText(text, 400);
  assert.equal(result.truncated, true);
  assert.equal(result.originalSize, 2000);
  assert.ok(size(result.text) <= 400);
  assert.ok(result.text.startsWith("aaa"));
  assert.ok(result.text.endsWith("bbb"));
  assert.match(result.text, /…（ここで .+ を省きました）…/);
});

test("truncateText: tailShare で終わりを多めに残す（ログ）", () => {
  const text = `${"a".repeat(1000)}${"b".repeat(1000)}`;
  const result = truncateText(text, 500, 0.8);
  const [head = "", tail = ""] = result.text.split(/\n\n….*…\n\n/);
  assert.ok(tail.length > head.length * 3, `${head.length} / ${tail.length}`);
});

test("truncateText: 文字の途中では切らない", () => {
  const result = truncateText("あ".repeat(1000), 301);
  assert.ok(!result.text.includes("\uFFFD"));
  assert.ok(size(result.text) <= 301);
});

test("formatSize", () => {
  assert.equal(formatSize(10), "10 B");
  assert.equal(formatSize(2048), "2.0 KB");
  assert.equal(formatSize(45 * 1024 * 1024), "45.0 MB");
});
