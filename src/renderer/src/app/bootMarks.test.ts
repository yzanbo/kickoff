import assert from "node:assert/strict";
import { test } from "vitest";
import type { BootReport } from "@shared/ipc";
import { createFakeScheduler } from "@shared/testing/fakeScheduler";
import { BOOT_TIMEOUT_MS, createBootMarks } from "./bootMarks";

/** 時計・描画・タイマーを手で進める偽物（描いたあとの予約はフレーム） */
function fake() {
  const clock = createFakeScheduler(1_000);
  const sent: BootReport[] = [];
  const marks = createBootMarks({
    now: clock.now,
    send: (r) => sent.push(r),
    afterPaint: clock.frame,
    later: (ms, fn) => clock.timer(fn, ms),
    collect: () => ({ marks: { firstPaint: 1_100 }, assets: { count: 3, refetched: 1, encodedKB: 50 } }),
    timeOrigin: 900,
  });
  return { clock, sent, marks, paint: clock.runFrames };
}

test("createBootMarks: 待つ部分と最初の描き終わりがそろってから、描いたあとの時刻を interactive にして 1 回だけ送る", () => {
  const f = fake();
  f.marks.mark("entry");
  f.marks.expect("main", ["sidebar", "composer"]);
  f.clock.advance(200);
  f.marks.markInteractive("sidebar");
  f.marks.mark("firstCommit");
  f.paint();
  // 入力欄がまだなので出さない
  assert.equal(f.sent.length, 0);
  f.clock.advance(100);
  f.marks.markInteractive("composer");
  f.clock.advance(50);
  f.paint();
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.sent[0], {
    window: "main",
    timeOrigin: 900,
    marks: { entry: 1_000, firstCommit: 1_200, firstPaint: 1_100, interactive: 1_350 },
    assets: { count: 3, refetched: 1, encodedKB: 50 },
  });
  // 2 回目以降は送らない（同じ印・時間切れも）
  f.marks.markInteractive("composer");
  f.marks.mark("appImported");
  f.clock.advance(BOOT_TIMEOUT_MS);
  f.paint();
  assert.equal(f.sent.length, 1);
});

test("createBootMarks: 10 秒でそろわなければ interactive を null にして送る", () => {
  const f = fake();
  f.marks.mark("entry");
  f.marks.expect("main", ["sidebar"]);
  f.marks.mark("firstCommit");
  f.clock.advance(BOOT_TIMEOUT_MS - 1);
  assert.equal(f.sent.length, 0);
  f.clock.advance(1);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].marks.interactive, null);
  // 遅れて部品がそろっても、もう送らない
  f.marks.markInteractive("sidebar");
  f.paint();
  assert.equal(f.sent.length, 1);
});

test("createBootMarks: 待つ部分がなければ（別ウィンドウ）最初の描き終わりのあとの描画で送る。待つ部分を決める前には送らない", () => {
  const f = fake();
  f.marks.mark("firstCommit");
  f.paint();
  assert.equal(f.clock.pending.frames, 0);
  f.marks.expect("popout", []);
  f.paint();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].window, "popout");
  assert.equal(f.sent[0].marks.interactive, 1_000);
});
