import assert from "node:assert/strict";
import { test } from "vitest";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { noteSync, noteSyncSince, STALL_TICK_MS, startStallWatch, syncStart, timed, type StallClock, type StallRecord } from "./stallWatch";

/** 手で進める時計（刻みは tick で呼ぶ） */
function fakeClock() {
  const state = { now: 1_000, cpu: 0, gc: 0, ticks: [] as (() => void)[] };
  const clock: StallClock = {
    now: () => state.now,
    every: (_ms, fn) => {
      state.ticks.push(fn);
      return () => {
        state.ticks = state.ticks.filter((f) => f !== fn);
      };
    },
    cpuMs: () => state.cpu,
    gcMs: () => state.gc,
    rssMB: () => 100,
  };
  /** ms たってから刻みが来た（cpu: その間に使った CPU） */
  const advance = (ms: number, cpu = ms) => {
    state.now += ms;
    state.cpu += cpu;
    for (const fn of state.ticks) fn();
  };
  return { state, clock, advance };
}

function watch() {
  const fake = fakeClock();
  const records: StallRecord[] = [];
  const stop = startStallWatch({ process: "main", onStall: (r) => records.push(r), clock: fake.clock });
  afterTest(stop);
  return { ...fake, records, stop };
}

test("startStallWatch: 遅れが 500ms までは記録せず、超えたら 1 件（遅れは刻みの間隔を引いたもの）", () => {
  const w = watch();
  w.advance(STALL_TICK_MS);
  w.advance(STALL_TICK_MS + 500);
  assert.equal(w.records.length, 0);
  w.advance(STALL_TICK_MS + 501);
  assert.equal(w.records.length, 1);
  assert.equal(w.records[0].blockedMs, 501);
  assert.equal(w.records[0].kind, "blocked");
  assert.equal(w.records[0].process, "main");
  assert.equal(w.records[0].task, null);
  assert.equal(w.records[0].rssMB, 100);
});

test("startStallWatch: その刻みでいちばん長い名前付きの処理を選び、刻みごとに忘れる。20ms 以下は名前を作らない", () => {
  const w = watch();
  let built = 0;
  noteSync("sqlite:select chats", 30);
  noteSync("http:GET /api/chats/:id", 700);
  noteSync(() => {
    built++;
    return "bus:chat";
  }, 400);
  noteSync(() => {
    built++;
    return "速い";
  }, 20);
  w.advance(STALL_TICK_MS + 900);
  assert.equal(w.records[0].task, "http:GET /api/chats/:id");
  assert.equal(w.records[0].taskMs, 700);
  // 400ms のものは 700ms より短いので名前を作らない。20ms 以下も作らない
  assert.equal(built, 0);
  w.advance(STALL_TICK_MS + 900);
  assert.equal(w.records.length, 2);
  assert.equal(w.records[1].task, null);
});

test("startStallWatch: CPU を使っていなければ throttled、名前付きの処理（同期の I/O など）が占めていれば blocked", () => {
  const w = watch();
  w.advance(STALL_TICK_MS + 1000, 10);
  assert.equal(w.records[0].kind, "throttled");
  noteSync("boot:loadLoginShellPath", 900);
  w.advance(STALL_TICK_MS + 1000, 10);
  assert.equal(w.records[1].kind, "blocked");
  assert.equal(w.records[1].cpuMs, 10);
});

test("startStallWatch: 同じ処理の詰まりは 10 秒に 1 行へまとめ、repeat と長いほうの値を書く。止めるときにまとめた分を出す", () => {
  const w = watch();
  const stall = (ms: number) => {
    noteSync("sse:chat_live", ms);
    w.advance(STALL_TICK_MS + ms);
  };
  stall(600);
  stall(900);
  stall(700);
  assert.equal(w.records.length, 1);
  // 10 秒たてば、まとめた分を 1 行で出す
  for (let i = 0; i < 50; i++) w.advance(STALL_TICK_MS);
  assert.equal(w.records.length, 2);
  assert.equal(w.records[1].repeat, 2);
  assert.equal(w.records[1].blockedMs, 900);
  assert.equal(w.records[1].taskMs, 900);
  // 別の処理はまとめない
  noteSync("bus:chat", 800);
  w.advance(STALL_TICK_MS + 800);
  assert.equal(w.records.length, 3);
  stall(600);
  assert.equal(w.records.length, 3);
  w.stop();
  assert.equal(w.records.length, 4);
  assert.equal(w.records[3].repeat, 1);
});

test("timed: 返す値と例外を変えず、かかった時間を名前付きで覚える（名前は引数から作れる）", () => {
  const w = watch();
  const slow = timed(
    (sql: string) => `sqlite:${sql}`,
    (sql: string) => {
      w.state.now += 600;
      if (sql === "bad") throw new Error("失敗");
      return sql.length;
    },
  );
  assert.equal(slow("select"), 6);
  w.advance(STALL_TICK_MS);
  assert.equal(w.records[0].task, "sqlite:select");
  assert.equal(w.records[0].taskMs, 600);
  assert.throws(() => slow("bad"), /失敗/);
  w.advance(STALL_TICK_MS);
  assert.equal(w.records[1].task, "sqlite:bad");
});

test("syncStart / noteSyncSince: 始まりからの時間を覚える。見張りがなければ何もしない", () => {
  const before = syncStart();
  noteSyncSince(before, () => assert.fail("見張りがないのに名前を作った"));
  assert.equal(timed("x", () => 1)(), 1);
  const w = watch();
  const start = syncStart();
  w.state.now += 650;
  noteSyncSince(start, () => "provider:claude:assistant");
  w.advance(STALL_TICK_MS);
  assert.equal(w.records[0].task, "provider:claude:assistant");
});
