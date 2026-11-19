import assert from "node:assert/strict";
import { test } from "vitest";
import type { DiagnosticsOverview } from "@shared/foundation/ipc";
import { formatShortMs, overviewLines } from "./overviewLines";

const now = new Date(2026, 10, 16, 15, 0);
const iso = (h: number, m: number) => new Date(2026, 10, 16, h, m).toISOString();

const overview = (over: Partial<DiagnosticsOverview>): DiagnosticsOverview => ({
  logsDir: "/Users/me/Library/Logs/Kickoff Dev",
  stalls: { count: 0, longest: { main: null, core: null } },
  lastBoot: null,
  ...over,
});

test("formatShortMs: 1 秒未満は ms、それより長ければ小数 1 桁の秒", () => {
  assert.equal(formatShortMs(850), "850ms");
  assert.equal(formatShortMs(1234), "1.2秒");
});

test("overviewLines: 詰まりがなく起動の記録もなければ 2 行", () => {
  assert.deepEqual(overviewLines(overview({}), now), ["最近 24 時間の詰まり: なし", "最後の起動: 記録なし"]);
});

test("overviewLines: 件数・プロセスごとのいちばん長かったもの・最後の起動の 3 行", () => {
  const lines = overviewLines(
    overview({
      stalls: {
        count: 3,
        longest: {
          main: { at: iso(14, 3), blockedMs: 1200, task: "ipc:diagnostics.start" },
          core: { at: iso(13, 50), blockedMs: 800, task: null },
        },
      },
      lastBoot: { startedAt: iso(10, 0), firstPaintMs: 950, interactiveMs: 1310, timedOut: false },
    }),
    now,
  );
  assert.deepEqual(lines, [
    "最近 24 時間の詰まり: 3 件",
    "いちばん長かったもの: メインプロセス 1.2秒 ipc:diagnostics.start（今日 14:03）・コアのプロセス 800ms（今日 13:50）",
    "最後の起動: 今日 10:00（最初の描画 950ms・入力できるまで 1.3秒）",
  ]);
});

test("overviewLines: 取れなかった段階は「-」、10 秒でそろわなければそう書く", () => {
  const lines = overviewLines(overview({ lastBoot: { startedAt: iso(10, 0), firstPaintMs: null, interactiveMs: null, timedOut: true } }), now);
  assert.equal(lines[1], "最後の起動: 今日 10:00（最初の描画 -・入力できるまで 10 秒でそろわず）");
});
