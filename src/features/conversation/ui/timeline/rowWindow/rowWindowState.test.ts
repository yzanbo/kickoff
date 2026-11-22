import assert from "node:assert/strict";
import { test } from "vitest";
import { buildMetrics } from "./rowLayout";
import {
  QUIET_AFTER_REVEAL_MS,
  initialRowWindow,
  mountView,
  nearEdges,
  releaseRows,
  revealRows,
  settleItems,
  type RowFrame,
  type RowNewest,
  type RowPlace,
  type RowWindowState,
} from "./rowWindowState";

/** 高さ 100px・gap 0 の行を keys の数だけ並べた見方 */
function frameOf(keys: string[]): RowFrame {
  return { keys, indexOf: new Map(keys.map((k, i) => [k, i])), m: buildMetrics(keys.map(() => 100), 0) };
}
const keysOf = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `k${from + i}`);
const ctx = (newest: RowNewest = "end", now = 1000) => ({ newest, viewport: () => 500, now: () => now });
const open = (keys: string[], place: RowPlace = "newest", newest: RowNewest = "end") => settleItems(initialRowWindow(place), frameOf(keys), ctx(newest)).state;
const mounted = (s: RowWindowState) => [...s.mounted].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

test("開いた直後は新しい側の端から見えている高さぶんだけ描く（新しいものが上なら上の端から）", () => {
  assert.deepEqual(mounted(open(keysOf(0, 50))), keysOf(45, 50));
  assert.deepEqual(mounted(open(keysOf(0, 50), "newest", "start")), keysOf(0, 6));
});

test("覚えた位置から開くとその前後を描き、並びにない位置なら新しい側の端から", () => {
  assert.deepEqual(mounted(open(keysOf(0, 50), { key: "k10", offset: 50 })), keysOf(10, 16));
  const gone = open(keysOf(0, 50), { key: "x", offset: 0 });
  assert.equal(gone.place, "newest");
  assert.deepEqual(mounted(gone), keysOf(45, 50));
});

test("同じ並びなら同じ state を返す", () => {
  const s = open(keysOf(0, 50));
  assert.equal(settleItems(s, frameOf(keysOf(0, 50)), ctx()).state, s);
});

test("新しい側の端の行を描いていたら、届いた項目も描く（描いていなければ描かない）", () => {
  const s = open(keysOf(0, 50));
  const next = settleItems(s, frameOf(keysOf(0, 52)), ctx()).state;
  assert.deepEqual(mounted(next), keysOf(45, 52));
  assert.equal(next.version, s.version + 1);
  assert.equal(next.edge.key, "k51");
  // 上を読んでいる（端の行を描いていない）
  const up = open(keysOf(0, 50), { key: "k0", offset: 0 });
  assert.deepEqual(mounted(settleItems(up, frameOf(keysOf(0, 52)), ctx()).state), keysOf(0, 6));
  // 新しいものが上: 前に届いた項目
  const top = open(keysOf(0, 50), "newest", "start");
  assert.deepEqual(mounted(settleItems(top, frameOf(["k-1", ...keysOf(0, 50)]), ctx("start")).state), ["k-1", ...keysOf(0, 6)]);
});

test("前に項目が増えたときは描く行を変えない（位置は描く前に読んだ行で直す）", () => {
  const s = open(keysOf(0, 50));
  assert.equal(settleItems(s, frameOf([...keysOf(-5, 0), ...keysOf(0, 50)]), ctx()).state, s);
});

test("並びを全部入れ替えたら新しい側の端から描き直し、しばらく読み足さない", () => {
  const s = open(keysOf(0, 50));
  const r = settleItems(s, frameOf(keysOf(100, 120)), ctx("end", 5000));
  assert.equal(r.replaced, true);
  assert.deepEqual(mounted(r.state), keysOf(115, 120));
  assert.equal(r.state.quietUntil, 5000 + QUIET_AFTER_REVEAL_MS);
});

test("開いた直後の範囲は下に余裕だけ、広げたあとは上下に余裕", () => {
  const f = frameOf(keysOf(0, 50));
  const s = initialRowWindow(null);
  assert.deepEqual(mounted(mountView(s, f, { top: 2000, height: 500 })), keysOf(20, 32));
  assert.deepEqual(mounted(mountView({ ...s, initial: false }, f, { top: 2000, height: 500 })), keysOf(14, 32));
});

test("外すのは遠くて見ていない行だけ（残す印の行は残す）。並びにない行は落とす", () => {
  const f = frameOf(keysOf(0, 200));
  const all: RowWindowState = { ...initialRowWindow(null), mounted: new Set([...keysOf(0, 200), "gone"]), version: 3 };
  const view = { top: 19500, height: 500 };
  const r = releaseRows(all, f, { view, now: 10_000, lastSeen: () => 0, keep: (i) => i === 3 });
  assert.equal(r.changed, true);
  assert.equal(r.state.version, 4);
  assert.deepEqual(mounted(r.state), ["k3", ...keysOf(147, 200)]);
  // 見たばかり: 外さず、あとでもう一度（並びにない行だけ落とし、描き直さない）
  const recent = releaseRows(all, f, { view, now: 10_000, lastSeen: () => 9_000, keep: () => false });
  assert.deepEqual({ changed: recent.changed, retry: recent.retry, version: recent.state.version, gone: recent.state.mounted.has("gone") }, { changed: false, retry: true, version: 3, gone: false });
});

test("移る処理は行き先の前後を描き、1.5 秒は読み足しを頼まない", () => {
  const f = frameOf(keysOf(0, 50));
  const r = revealRows(open(keysOf(0, 50)), f, 10, 200, 1000);
  assert.ok(keysOf(8, 14).every((k) => r.state.mounted.has(k)));
  assert.deepEqual(r.range, { start: 8, end: 14 });
  const el = { scrollTop: 0, scrollHeight: 5000, height: 500 };
  assert.deepEqual(nearEdges(r.state, el, 1000 + QUIET_AFTER_REVEAL_MS - 1), { start: false, end: false });
  assert.deepEqual(nearEdges(r.state, el, 1000 + QUIET_AFTER_REVEAL_MS), { start: true, end: false });
});
