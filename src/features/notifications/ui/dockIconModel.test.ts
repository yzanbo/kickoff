import assert from "node:assert/strict";
import { test } from "vitest";
import { digitColorFor, dockBadgeLayout } from "./dockIconModel";

/** 1 文字 40px として測る */
const measure = (label: string) => label.length * 40;

test("dockBadgeLayout: 0 の状態は描かず、左上 = 作業中・右上 = 未読・左下 = 回答待ちに置く", () => {
  assert.deepEqual(dockBadgeLayout({ running: 0, needs_input: 0, unread: 0 }, 512, measure), []);
  const badges = dockBadgeLayout({ running: 2, needs_input: 1, unread: 5 }, 512, measure);
  assert.deepEqual(
    badges.map((b) => b.column),
    ["running", "unread", "needs_input"],
  );
  const [running, unread, waiting] = badges;
  // 左上と左下は左端がそろい、左上と右上は上端がそろう
  assert.equal(running.x, waiting.x);
  assert.equal(running.y, unread.y);
  assert.ok(unread.x > running.x + running.width);
  assert.ok(waiting.y > running.y + running.height);
  // 画像からはみ出さない
  for (const b of badges) {
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 512 && b.y + b.height <= 512, `${b.column} がはみ出した`);
  }
});

test("dockBadgeLayout: 1 桁は円、2 桁以上は横に伸び、右上は右端をそろえて左へ伸びる", () => {
  const [one] = dockBadgeLayout({ running: 0, needs_input: 0, unread: 3 }, 512, measure);
  const [many] = dockBadgeLayout({ running: 0, needs_input: 0, unread: 120 }, 512, measure);
  assert.equal(one.width, one.height);
  assert.equal(many.label, "99+");
  assert.ok(many.width > many.height);
  assert.equal(many.x + many.width, one.x + one.width);
  const [leftOne] = dockBadgeLayout({ running: 3, needs_input: 0, unread: 0 }, 512, measure);
  const [leftMany] = dockBadgeLayout({ running: 42, needs_input: 0, unread: 0 }, 512, measure);
  assert.equal(leftMany.x, leftOne.x);
  assert.ok(leftMany.width > leftOne.width);
});

test("digitColorFor: ダークのテーマの明るい色では黒っぽく、ライトのテーマの濃い色では白い数字", () => {
  for (const dark of ["#65acee", "#45c66d", "#e4962f"]) assert.equal(digitColorFor(dark), "#111111", dark);
  for (const light of ["#1276c6", "#0c9d49", "#b97515"]) assert.equal(digitColorFor(light), "#ffffff", light);
  assert.equal(digitColorFor("rgb(255, 255, 255)"), "#111111");
  assert.equal(digitColorFor("rgba(255, 255, 255, 0.5)"), "#ffffff");
  assert.equal(digitColorFor("none"), "#ffffff");
});
