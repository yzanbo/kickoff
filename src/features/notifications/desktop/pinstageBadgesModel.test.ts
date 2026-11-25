import assert from "node:assert/strict";
import { test } from "vitest";
import { encodePinstageBadges, pinstageBadgeItems } from "./pinstageBadgesModel";

test("Pinstage の JSON は版・PID・秒での時刻と、決められた隅・文言・件数・色を持つ", () => {
  const items = pinstageBadgeItems({
    counts: { running: 1_000_001, needsInput: 101, unread: 3 },
    colors: { running: "#65acee", needsInput: "#E4962F", unread: "#45c66d\n" },
  });
  assert.deepEqual(JSON.parse(encodePinstageBadges(items, 12345, 1795670000125)), {
    version: 1,
    bundleID: "dev.zanbo.kickoff",
    pid: 12345,
    updatedAt: 1795670000.125,
    badges: [
      { corner: "topLeft", count: 1_000_000, label: "作業中", color: "#65ACEE" },
      { corner: "bottomLeft", count: 101, label: "回答待ち", color: "#E4962F" },
      { corner: "topRight", count: 3, label: "未読" },
    ],
  });
});

test("0 件の項目を除き、全件 0 なら空配列を送り、JSON の大きさは UTF-8 のバイト数で制限する", () => {
  const items = pinstageBadgeItems({
    counts: { running: 0, needsInput: 0, unread: 0 },
    colors: { running: "#65acee", needsInput: null, unread: null },
  });
  assert.deepEqual(JSON.parse(encodePinstageBadges(items, 415, 1_001)).badges, []);
  assert.throws(() => encodePinstageBadges([{ corner: "topLeft", label: "あ".repeat(3_000), count: 1 }], 415, 1_001), /8,192 バイト/);
});
