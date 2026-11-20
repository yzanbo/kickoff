import assert from "node:assert/strict";
import { createElement, Fragment } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { actionsToMenuItems, ActionBar, type ActionSpec } from "./ActionBar";
import { Highlight } from "./Highlight";
import { FieldPicker, MenuButton, MenuEmpty, menuGroups } from "./menuParts";
import { PathParts } from "./PathParts";
import { nextPills, PillGroup } from "./PillGroup";
import { SplitButton } from "./SplitButton";

const html = (node: Parameters<typeof renderToString>[0]) => renderToString(node);
const item = (text: string) => createElement("button", { key: text }, text);

test("menuGroups: 空の組（出さない項目だけの組）を外し、組の間にだけ線を入れる", () => {
  const out = html(createElement(Fragment, null, ...menuGroups([[item("a"), false], [null, undefined], [item("b"), item("c")], []])));
  assert.equal(out.match(/role="separator"/g)?.length, 1);
  assert.match(out, /<button>a<\/button><div class="menu-separator" role="separator"><\/div><button>b<\/button><button>c<\/button>/);
  assert.deepEqual(menuGroups([[false], []]), []);
});

test("actionsToMenuItems・ActionBar: 同じ表からボタン列とメニューの項目を描き、押せない理由を title に出す", () => {
  const specs: ActionSpec[] = [
    { id: "start", label: "起動", run: () => {} },
    { id: "stop", label: "止める", disabled: "動いていません", danger: true, run: () => {} },
  ];
  const bar = html(createElement(ActionBar, { specs, label: "操作" }));
  assert.match(bar, /role="toolbar" aria-label="操作"/);
  assert.match(bar, /disabled="" title="動いていません"/);
  const items = actionsToMenuItems(specs);
  assert.equal(items.length, 2);
  assert.equal(items[1].props.disabled, true);
  assert.equal(items[1].props.title, "動いていません");
  assert.equal(items[0].props.title, undefined);
});

test("nextPills: single は押したものだけ、multi は付け外し、keepOne は最後の 1 つを外させない", () => {
  assert.deepEqual(nextPills(["a"], "b", "single"), ["b"]);
  assert.equal(nextPills(["a"], "a", "single"), null);
  assert.deepEqual(nextPills(["a"], "b", "multi"), ["a", "b"]);
  assert.deepEqual(nextPills(["a", "b"], "a", "multi", true), ["b"]);
  assert.equal(nextPills(["a"], "a", "multi", true), null);
  assert.deepEqual(nextPills(["a"], "a", "multi"), []);
});

test("PillGroup: single は radio と aria-checked、multi は aria-pressed。選んだものに active", () => {
  const pills = [
    { key: "a", label: "A" },
    { key: "b", label: "B" },
  ];
  const single = html(createElement(PillGroup<string>, { pills, selected: ["b"], mode: "single", label: "範囲", pillClassName: "pill", onChange: () => {} }));
  assert.match(single, /role="radiogroup" aria-label="範囲"/);
  assert.match(single, /class="pill active" role="radio" aria-checked="true"/);
  const multi = html(createElement(PillGroup<string>, { pills, selected: ["a"], mode: "multi", label: "状態", pillClassName: "pill", onChange: () => {} }));
  assert.match(multi, /role="group"/);
  assert.match(multi, /class="pill active" aria-pressed="true"/);
  assert.match(multi, /class="pill" aria-pressed="false"/);
});

test("Highlight・PathParts: 見つかった所を mark で包む。order でフォルダを先に並べる", () => {
  assert.equal(html(createElement(Highlight, { text: "abcdef", marks: [[1, 2], [4, 6]] })), "a<mark>b</mark>cd<mark>ef</mark>");
  const parts = { path: "src/a.ts", nameClass: "n", dirClass: "d" };
  assert.match(html(createElement(PathParts, parts)), /class="n">a\.ts<\/span><span class="d">/);
  assert.match(html(createElement(PathParts, { ...parts, order: "path-first" })), /class="d">src<\/span><span class="n">a\.ts/);
});

test("MenuButton・SplitButton・MenuEmpty・FieldPicker: 開くボタンの印と、押せない項目・チェックの項目", () => {
  const button = html(createElement(MenuButton, { className: "more", menuLabel: "操作", items: () => null, children: "…" }));
  assert.match(button, /aria-haspopup="menu" aria-expanded="false"/);
  const split = html(createElement(SplitButton, { onClick: () => {}, moreLabel: "ほかの送り方", items: () => null, children: "送る" }));
  assert.match(split, /class="split-button"/);
  assert.match(split, /class="split-button-main"/);
  assert.match(html(createElement(MenuEmpty, null, "ありません")), /aria-disabled="true">ありません/);
  const picker = FieldPicker({ fields: ["a", "b"], labels: { a: "A", b: "B" }, shown: ["b"], onToggle: () => {} });
  assert.deepEqual(
    picker.map((p) => p.props.checked),
    [false, true],
  );
});
