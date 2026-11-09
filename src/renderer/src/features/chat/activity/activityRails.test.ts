import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActivityRow } from "./activityRows";
import { flipRails, layoutRails } from "./activityRails";

type Row = Pick<ActivityRow, "agent" | "kind" | "child">;
const row = (agent: string | null, kind: ActivityRow["kind"] = "tools", child?: string): Row => ({ agent, kind, ...(child ? { child } : {}) });
/** 行ごとの「節の列: 線（列 持ち主 始め-終わり）」 */
const draw = (rows: Row[]) =>
  layoutRails(rows).rows.map((r) => [r.col, r.segments.map((s) => `${s.col}:${s.agent ?? "main"}:${s.from}-${s.to}`).sort(), r.branch ? `${r.branch.from}>${r.branch.to}` : ""]);

test("layoutRails: メインだけなら 1 列。最初の行は節から始まり、あとは上から下まで通る", () => {
  assert.deepEqual(draw([row(null, "prompt"), row(null), row(null, "reply")]), [
    [0, ["0:main:node-bottom"], ""],
    [0, ["0:main:top-bottom"], ""],
    [0, ["0:main:top-bottom"], ""],
  ]);
  assert.equal(layoutRails([row(null)]).width, 1);
});

test("layoutRails: 起動の行で子の線が右へ枝分かれし、終わりの行の節で閉じ、その列はあとで使い回す", () => {
  const rows = [row(null, "prompt"), row(null, "launch", "a"), row("a"), row(null), row("a", "end"), row(null, "launch", "b"), row("b")];
  assert.deepEqual(draw(rows), [
    [0, ["0:main:node-bottom"], ""],
    [0, ["0:main:top-bottom", "1:a:node-bottom"], "0>1"],
    [1, ["0:main:top-bottom", "1:a:top-bottom"], ""],
    [0, ["0:main:top-bottom", "1:a:top-bottom"], ""],
    [1, ["0:main:top-bottom", "1:a:top-node"], ""],
    [0, ["0:main:top-bottom", "1:b:node-bottom"], "0>1"],
    [1, ["0:main:top-bottom", "1:b:top-bottom"], ""],
  ]);
  assert.equal(layoutRails(rows).width, 2);
});

test("layoutRails: 並べて起動したものは別の列、入れ子は起動した親より右の列", () => {
  const rows = [row(null, "launch", "a"), row(null, "launch", "b"), row("a", "launch", "c"), row("c"), row("b")];
  const layout = layoutRails(rows);
  assert.deepEqual(layout.rows.map((r) => r.col), [0, 0, 1, 3, 2]);
  assert.deepEqual(layout.rows[2].branch, { from: 1, to: 3, agent: "c" });
  assert.equal(layout.width, 4);
});

test("layoutRails: 絞り込みで行のない子へは枝分かれせず、起動の行のない持ち主は最初の行の節から線を始める", () => {
  assert.deepEqual(draw([row(null, "launch", "gone"), row(null)]), [
    [0, ["0:main:node-bottom"], ""],
    [0, ["0:main:top-bottom"], ""],
  ]);
  assert.deepEqual(draw([row("a"), row("a", "launch", "b"), row("b", "end"), row("a", "end")]), [
    [0, ["0:a:node-bottom"], ""],
    [0, ["0:a:top-bottom", "1:b:node-bottom"], "0>1"],
    [1, ["0:a:top-bottom", "1:b:top-node"], ""],
    [0, ["0:a:top-node"], ""],
  ]);
});

test("flipRails: 上を最新にするときは行を逆にし、縦の線の向きを入れ替える（子の線は起動の行の節から上へ、終わりの行の節で閉じる）", () => {
  const rows = [row(null, "prompt"), row(null, "launch", "a"), row("a"), row("a", "end"), row(null, "reply")];
  const flipped = flipRails(layoutRails(rows));
  const drawn = flipped.rows.map((r) => [r.col, r.segments.map((s) => `${s.col}:${s.agent ?? "main"}:${s.from}-${s.to}`).sort(), r.branch ? `${r.branch.from}>${r.branch.to}` : ""]);
  assert.deepEqual(drawn, [
    [0, ["0:main:top-bottom"], ""],
    [1, ["0:main:top-bottom", "1:a:node-bottom"], ""],
    [1, ["0:main:top-bottom", "1:a:top-bottom"], ""],
    [0, ["0:main:top-bottom", "1:a:top-node"], "0>1"],
    [0, ["0:main:top-node"], ""],
  ]);
  assert.equal(flipped.width, 2);
});
