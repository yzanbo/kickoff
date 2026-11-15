import assert from "node:assert/strict";
import { test } from "vitest";
import type { BootReport } from "@shared/ipc";
import { BOOT_TIMEOUT_MS, createBootMarks } from "./bootMarks";

/** 時計・描画・タイマーを手で進める偽物 */
function fake() {
  const state = { now: 1_000, sent: [] as BootReport[], paints: [] as (() => void)[], timers: [] as { at: number; fn: () => void }[] };
  const marks = createBootMarks({
    now: () => state.now,
    send: (r) => state.sent.push(r),
    afterPaint: (fn) => state.paints.push(fn),
    later: (ms, fn) => state.timers.push({ at: state.now + ms, fn }),
    collect: () => ({ marks: { firstPaint: 1_100 }, assets: { count: 3, refetched: 1, encodedKB: 50 } }),
    timeOrigin: 900,
  });
  const paint = () => state.paints.splice(0).forEach((fn) => fn());
  const advance = (ms: number) => {
    state.now += ms;
    for (const t of state.timers.filter((x) => x.at <= state.now)) t.fn();
  };
  return { state, marks, paint, advance };
}

test("createBootMarks: 待つ部分と最初の描き終わりがそろってから、描いたあとの時刻を interactive にして 1 回だけ送る", () => {
  const f = fake();
  f.marks.mark("entry");
  f.marks.expect("main", ["sidebar", "composer"]);
  f.state.now = 1_200;
  f.marks.markInteractive("sidebar");
  f.marks.mark("firstCommit");
  f.paint();
  // 入力欄がまだなので出さない
  assert.equal(f.state.sent.length, 0);
  f.state.now = 1_300;
  f.marks.markInteractive("composer");
  f.state.now = 1_350;
  f.paint();
  assert.equal(f.state.sent.length, 1);
  assert.deepEqual(f.state.sent[0], {
    window: "main",
    timeOrigin: 900,
    marks: { entry: 1_000, firstCommit: 1_200, firstPaint: 1_100, interactive: 1_350 },
    assets: { count: 3, refetched: 1, encodedKB: 50 },
  });
  // 2 回目以降は送らない（同じ印・時間切れも）
  f.marks.markInteractive("composer");
  f.marks.mark("appImported");
  f.advance(BOOT_TIMEOUT_MS);
  f.paint();
  assert.equal(f.state.sent.length, 1);
});

test("createBootMarks: 10 秒でそろわなければ interactive を null にして送る", () => {
  const f = fake();
  f.marks.mark("entry");
  f.marks.expect("main", ["sidebar"]);
  f.marks.mark("firstCommit");
  f.advance(BOOT_TIMEOUT_MS - 1);
  assert.equal(f.state.sent.length, 0);
  f.advance(1);
  assert.equal(f.state.sent.length, 1);
  assert.equal(f.state.sent[0].marks.interactive, null);
  // 遅れて部品がそろっても、もう送らない
  f.marks.markInteractive("sidebar");
  f.paint();
  assert.equal(f.state.sent.length, 1);
});

test("createBootMarks: 待つ部分がなければ（別ウィンドウ）最初の描き終わりのあとの描画で送る。待つ部分を決める前には送らない", () => {
  const f = fake();
  f.marks.mark("firstCommit");
  f.paint();
  assert.equal(f.state.paints.length, 0);
  f.marks.expect("popout", []);
  f.paint();
  assert.equal(f.state.sent.length, 1);
  assert.equal(f.state.sent[0].window, "popout");
  assert.equal(f.state.sent[0].marks.interactive, 1_000);
});
