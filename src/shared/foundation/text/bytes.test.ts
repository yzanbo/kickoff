import assert from "node:assert/strict";
import { test } from "vitest";
import { formatBytes } from "./bytes";

test("formatBytes: B・KB・MB・GB", () => {
  assert.equal(formatBytes(10), "10 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(45 * 1024 * 1024), "45.0 MB");
  assert.equal(formatBytes(3 * 1024 * 1024 * 1024), "3.0 GB");
});
