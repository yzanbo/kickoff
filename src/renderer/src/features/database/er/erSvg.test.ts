import assert from "node:assert/strict";
import { test } from "node:test";
import { erSvg, type ErSvgBox, type ErSvgColors } from "./erSvg";

const colors: ErSvgColors = { background: "#fff", box: "#fafafa", head: "#eee", border: "#ccc", text: "#111", muted: "#777", edge: "#888", key: "#c80" };
const users: ErSvgBox = {
  name: "users",
  view: false,
  x: 300,
  y: 0,
  width: 180,
  height: 80,
  columns: [
    { name: "id", type: "INTEGER", primaryKey: true, foreignKey: false, nullable: false },
    { name: "name", type: "TEXT", primaryKey: false, foreignKey: false, nullable: true },
  ],
};
const posts: ErSvgBox = { name: "posts<&>", view: true, x: 0, y: 40, width: 160, height: 58, columns: [{ name: "user_id", type: "INTEGER", primaryKey: false, foreignKey: true, nullable: true }] };

test("erSvg: 全体を余白つきで収め、名前は逃がし、主キー・外部キーの印と NULL の「?」を付ける", () => {
  const { svg, width, height } = erSvg([users, posts], [], colors);
  assert.equal(width, 480 + 48);
  assert.equal(height, 98 + 48);
  assert.match(svg, /viewBox="-24 -24 528 146"/);
  assert.match(svg, />posts&lt;&amp;&gt;</);
  assert.match(svg, /font-style="italic"/);
  assert.match(svg, />PK</);
  assert.match(svg, />FK</);
  assert.match(svg, />TEXT\?</);
  // 主キーの列は NULL を許しても「?」を付けない（users.id は付けず、posts.user_id だけ）
  assert.equal(svg.match(/>INTEGER\?</g)?.length, 1);
});

test("erSvg: 線は子の列の行から親の列の行へ（子が左なら子の右端から）。推測は点線、ない箱の線は描かない", () => {
  const card = { child: "many", parent: "required" } as const;
  const { svg } = erSvg([users, posts], [{ from: "posts<&>", to: "users", fromColumn: "user_id", toColumn: "id", inferred: true, cardinality: card }, { from: "posts<&>", to: "nope", fromColumn: null, toColumn: null, inferred: false, cardinality: card }], colors);
  // 子（posts）の user_id の行: 40 + 30 + 3 + 11 = 84、親（users）の id の行: 0 + 30 + 3 + 11 = 44
  assert.match(svg, /d="M160 84H230V44H300"/);
  assert.match(svg, /stroke-dasharray="5 4"/);
  assert.equal(svg.match(/stroke-width="1.2"/g)?.length, 2);
});

test("erSvg: 箱がなければ余白だけの小さな図", () => {
  const { width, height } = erSvg([], [], colors);
  assert.equal(width, 48);
  assert.equal(height, 48);
});
