import assert from "node:assert/strict";
import { test } from "node:test";
import { activeTabOf, FIRST_PANE, homePane, isTabVisible, leavesOf, nextActiveTab, normalize, paneOfTab, singlePane, type PaneLayout, type PaneNode } from "./paneTree";
import { closeLayoutTabs, closePane, focusPane, moveTab, placeTab, reconcileLayout, renameTab, returnToHome, splitPane } from "./paneLayout";
import { equalizeSplit, setSplitSizes } from "./paneSizes";

const pane = (id: string, tabs: string[], active: string | null = tabs[0] ?? null): PaneNode => ({ type: "pane", id, tabs, active });

/** 木を読みやすい文字列にする（向き・ペインのタブ・表示中のタブ。割合は小数 2 桁） */
function shape(node: PaneNode): string {
  if (node.type === "pane") return `${node.id}[${node.tabs.map((t) => (t === node.active ? `*${t}` : t)).join(",")}]`;
  return `${node.dir}(${node.children.map((c, i) => `${node.sizes[i].toFixed(2)}:${shape(c)}`).join(" ")})`;
}

const base = (): PaneLayout => singlePane(["a", "b", "c"], "b");

test("singlePane: すべてのタブが入った 1 つのペイン。表示中のタブがなければ先頭", () => {
  assert.equal(shape(base().root), `${FIRST_PANE}[a,*b,c]`);
  assert.equal(shape(singlePane(["a"], "zzz").root), `${FIRST_PANE}[*a]`);
  assert.equal(shape(singlePane([], null).root), `${FIRST_PANE}[]`);
  assert.equal(activeTabOf(base()), "b");
});

test("splitPane: タブを右へ分けて移し、ピントは新しいペインへ", () => {
  const l = splitPane(base(), FIRST_PANE, "row", "after", "p1", "b");
  assert.equal(shape(l.root), `row(0.50:${FIRST_PANE}[a,*c] 0.50:p1[*b])`);
  assert.equal(l.focused, "p1");
  assert.equal(activeTabOf(l), "b");
  assert.equal(paneOfTab(l, "a")?.id, FIRST_PANE);
});

test("splitPane: 上・左に分ける、タブなしなら空のペイン", () => {
  const up = splitPane(base(), FIRST_PANE, "column", "before", "p1");
  assert.equal(shape(up.root), `column(0.50:p1[] 0.50:${FIRST_PANE}[a,*b,c])`);
  assert.equal(activeTabOf(up), null);
  const left = splitPane(base(), FIRST_PANE, "row", "before", "p1", "a");
  assert.equal(shape(left.root), `row(0.50:p1[*a] 0.50:${FIRST_PANE}[*b,c])`);
});

test("splitPane: 同じ向きの親の中では並べて、元のペインの大きさを半分ずつに", () => {
  const l1 = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  const l2 = splitPane(l1, "p1", "row", "after", "p2", "c");
  // p1 の c を p2 へ移すと p1 は空になるが、分けた元なので残す
  assert.equal(shape(l2.root), `row(0.50:${FIRST_PANE}[a,*b] 0.25:p1[] 0.25:p2[*c])`);
  const l3 = splitPane(l1, "p1", "column", "after", "p2", "a");
  assert.equal(shape(l3.root), `row(0.50:${FIRST_PANE}[*b] 0.50:column(0.50:p1[*c] 0.50:p2[*a]))`);
});

test("splitPane: 別のペインのタブを移して、その元のペインが空になったら消して詰める", () => {
  const l1 = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  const l2 = splitPane(l1, FIRST_PANE, "column", "after", "p2", "c");
  assert.equal(shape(l2.root), `column(0.50:${FIRST_PANE}[a,*b] 0.50:p2[*c])`);
});

test("splitPane: 知らないペイン・すでにある ID では何もしない", () => {
  const l = base();
  assert.equal(splitPane(l, "zzz", "row", "after", "p1", "a"), l);
  assert.equal(splitPane(l, FIRST_PANE, "row", "after", FIRST_PANE, "a"), l);
});

test("moveTab: 別のペインの位置へ移す。空になったペインは消し、同じ向きの入れ子は 1 段にまとめる", () => {
  const l1 = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  const l2 = moveTab(l1, "a", "p1", 0);
  assert.equal(shape(l2.root), `row(0.50:${FIRST_PANE}[*b] 0.50:p1[*a,c])`);
  assert.equal(l2.focused, "p1");
  const l3 = moveTab(l2, "b", "p1");
  assert.equal(shape(l3.root), `p1[a,c,*b]`);
  assert.equal(l3.focused, "p1");
  // row の中の column の中の row がなくなって row(...) が 1 段になる
  const nest = splitPane(splitPane(l1, "p1", "column", "after", "p2", "c"), "p2", "row", "after", "p3", "c");
  assert.equal(shape(nest.root), `row(0.50:${FIRST_PANE}[a,*b] 0.50:column(0.50:p1[] 0.50:row(0.50:p2[] 0.50:p3[*c])))`);
  const flat = moveTab(nest, "c", FIRST_PANE);
  assert.ok(leavesOf(flat.root).some((p) => p.id === "p2"));
  const n2 = moveTab(splitPane(nest, "p1", "row", "after", "p4", "a"), "a", "p3");
  // p4 が空になって消える
  assert.ok(!leavesOf(n2.root).some((p) => p.id === "p4"));
});

test("moveTab: 同じペインの中で並べ替える（index は移す前の並びの位置）", () => {
  assert.equal(shape(moveTab(base(), "a", FIRST_PANE, 3).root), `${FIRST_PANE}[b,c,*a]`);
  assert.equal(shape(moveTab(base(), "c", FIRST_PANE, 0).root), `${FIRST_PANE}[*c,a,b]`);
  assert.equal(shape(moveTab(base(), "a", FIRST_PANE, 2).root), `${FIRST_PANE}[b,*a,c]`);
  // 1 つしかないペインの中で動かしても消えない
  assert.equal(shape(moveTab(singlePane(["a"], "a"), "a", FIRST_PANE, 1).root), `${FIRST_PANE}[*a]`);
});

test("moveTab: 知らないタブ・ペインでは何もしない", () => {
  const l = base();
  assert.equal(moveTab(l, "zzz", FIRST_PANE), l);
  assert.equal(moveTab(l, "a", "zzz"), l);
});

test("normalize: 子が 1 つの分割は子に、同じ向きの入れ子は割合を掛けて 1 段に", () => {
  const tree: PaneNode = {
    type: "split",
    dir: "row",
    sizes: [0.5, 0.5],
    children: [pane("a", ["x"]), { type: "split", dir: "row", sizes: [0.5, 0.5], children: [pane("b", []), { type: "split", dir: "column", sizes: [1], children: [pane("c", [])] }] }],
  };
  assert.equal(shape(normalize(tree)), "row(0.50:a[*x] 0.25:b[] 0.25:c[])");
});

test("placeTab: どこかにあればそのペインで表示してピントを移す。なければピントのあるペインに足す", () => {
  const l1 = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  const l2 = placeTab(l1, "a");
  assert.equal(l2.focused, FIRST_PANE);
  assert.equal(shape(l2.root), `row(0.50:${FIRST_PANE}[*a,b] 0.50:p1[*c])`);
  const l3 = placeTab(focusPane(l2, "p1"), "d");
  assert.equal(shape(l3.root), `row(0.50:${FIRST_PANE}[*a,b] 0.50:p1[c,*d])`);
  assert.equal(activeTabOf(l3), "d");
  assert.ok(isTabVisible(l3, "a") && isTabVisible(l3, "d") && !isTabVisible(l3, "b"));
  // もうそのペインで表示していて、ピントもあれば同じ配置
  assert.equal(placeTab(l3, "d"), l3);
});

test("renameTab: 置き場所と表示中かはそのままでキーを変える", () => {
  const l = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  assert.equal(shape(renameTab(l, "c", "x").root), `row(0.50:${FIRST_PANE}[a,*b] 0.50:p1[*x])`);
  assert.equal(shape(renameTab(l, "a", "y").root), `row(0.50:${FIRST_PANE}[y,*b] 0.50:p1[*c])`);
  assert.equal(renameTab(l, "zzz", "x"), l);
});

test("focusPane: 同じペイン・知らないペインなら同じ配置を返す", () => {
  const l = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  assert.equal(focusPane(l, "p1"), l);
  assert.equal(focusPane(l, "zzz"), l);
  assert.equal(focusPane(l, FIRST_PANE).focused, FIRST_PANE);
});

test("closeLayoutTabs: 表示中なら隣のタブへ。空になったペインは消すが、最後の 1 つは残す", () => {
  assert.equal(shape(closeLayoutTabs(base(), ["b"]).root), `${FIRST_PANE}[a,*c]`);
  assert.equal(shape(closeLayoutTabs(base(), ["a", "b", "c"]).root), `${FIRST_PANE}[]`);
  const l1 = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  const l2 = closeLayoutTabs(l1, ["c"]);
  assert.equal(shape(l2.root), `${FIRST_PANE}[a,*b]`);
  // ピントのあったペインが消えたら残ったペインへ
  assert.equal(l2.focused, FIRST_PANE);
  // もとから空のペインは、ほかのタブを閉じても残す
  const empty = splitPane(base(), FIRST_PANE, "row", "after", "p1");
  assert.equal(shape(closeLayoutTabs(empty, ["a"]).root), `row(0.50:${FIRST_PANE}[*b,c] 0.50:p1[])`);
});

test("closePane: 中のタブを返し、ピントを隣へ。最後の 1 つは閉じない", () => {
  const l1 = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  const r = closePane(l1, "p1");
  assert.deepEqual(r.closed, ["c"]);
  assert.equal(shape(r.layout.root), `${FIRST_PANE}[a,*b]`);
  assert.equal(r.layout.focused, FIRST_PANE);
  const first = closePane(focusPane(l1, FIRST_PANE), FIRST_PANE);
  assert.equal(first.layout.focused, "p1");
  assert.deepEqual(closePane(base(), FIRST_PANE), { layout: base(), closed: [] });
});

test("setSplitSizes / equalizeSplit: path の分割の割合を変え、等分に戻す", () => {
  const l1 = splitPane(splitPane(base(), FIRST_PANE, "row", "after", "p1", "c"), "p1", "column", "after", "p2", "c");
  const l2 = setSplitSizes(l1, [], [3, 1]);
  assert.equal(shape(l2.root), `row(0.75:${FIRST_PANE}[a,*b] 0.25:column(0.50:p1[] 0.50:p2[*c]))`);
  const l3 = setSplitSizes(l2, [1], [0.2, 0.8]);
  assert.equal(shape(l3.root), `row(0.75:${FIRST_PANE}[a,*b] 0.25:column(0.20:p1[] 0.80:p2[*c]))`);
  // 数が合わない・ペインを指す path では変えない
  assert.equal(shape(setSplitSizes(l3, [], [1, 1, 1]).root), shape(l3.root));
  assert.equal(shape(equalizeSplit(l3, [1]).root), `row(0.75:${FIRST_PANE}[a,*b] 0.25:column(0.50:p1[] 0.50:p2[*c]))`);
  assert.equal(equalizeSplit(l3, [0]), l3);
});

test("reconcileLayout: 消えたタブを外し、どこにもないタブは一覧のペインに足す（ピントのある分けたペインには足さない）", () => {
  const l1 = splitPane(base(), FIRST_PANE, "row", "after", "p1", "c");
  assert.equal(l1.focused, "p1");
  const r = reconcileLayout(l1, ["a", "c", "d"]);
  assert.equal(shape(r.root), `row(0.50:${FIRST_PANE}[*a,d] 0.50:p1[*c])`);
  assert.equal(r.focused, "p1");
  // ペインのタブがすべて消えたら、そのペインを詰める
  const gone = reconcileLayout(l1, ["a", "b"]);
  assert.equal(shape(gone.root), `${FIRST_PANE}[a,*b]`);
  assert.equal(gone.focused, FIRST_PANE);
  // 2 つのペインに同じタブがあれば、先のほうだけ残す
  const dup: PaneLayout = { root: { type: "split", dir: "row", sizes: [0.5, 0.5], children: [pane("x", ["a", "b"]), pane("y", ["b", "c"], "b")] }, focused: "y" };
  assert.equal(shape(reconcileLayout(dup, ["a", "b", "c"]).root), "row(0.50:x[*a,b] 0.50:y[*c])");
  // 知らないピントは先頭へ
  assert.equal(reconcileLayout({ ...dup, focused: "zzz" }, ["a", "b", "c"]).focused, "x");
  // タブが 1 つもなければ空の 1 ペイン
  assert.equal(shape(reconcileLayout(l1, []).root), `${FIRST_PANE}[]`);
  // もとから空のペインは残す
  const empty = splitPane(base(), FIRST_PANE, "row", "after", "p1");
  assert.equal(shape(reconcileLayout(empty, ["a", "b", "c"]).root), shape(empty.root));
});

test("homePane: 分けた元のペインを覚える。左・上に分けても移らず、閉じたら左上のペイン", () => {
  assert.equal(homePane(base()).id, FIRST_PANE);
  const left = splitPane(base(), FIRST_PANE, "row", "before", "p1", "a");
  assert.equal(homePane(left).id, FIRST_PANE);
  assert.equal(shape(reconcileLayout(left, ["a", "b", "c", "d"]).root), `row(0.50:p1[*a] 0.50:${FIRST_PANE}[*b,c,d])`);
  // 分けたペインをさらに分けても、一覧のペインは変わらない
  const more = splitPane(left, "p1", "column", "after", "p2");
  assert.equal(homePane(more).id, FIRST_PANE);
  // 一覧のペインを閉じたら、残ったペインの左上が一覧のペイン
  const closed = closePane(more, FIRST_PANE);
  assert.equal(homePane(closed.layout).id, "p1");
  // ほかの操作でも覚えを残す
  assert.equal(moveTab(more, "a", "p2").home, FIRST_PANE);
  assert.equal(placeTab(more, "z").home, FIRST_PANE);
  assert.equal(closeLayoutTabs(more, ["b"]).home, FIRST_PANE);
});

test("closePane: keep のタブ（サイドバーと連動したチャット）は閉じずに一覧のペインへ戻す", () => {
  const l1 = splitPane(splitPane(base(), FIRST_PANE, "row", "after", "p1", "c"), "p1", "column", "after", "p2");
  const l2 = moveTab(l1, "b", "p1");
  const r = closePane(l2, "p1", (k) => k === "c");
  assert.deepEqual(r.closed, ["b"]);
  assert.equal(shape(r.layout.root), `row(0.50:${FIRST_PANE}[*a,c] 0.50:p2[])`);
  // 一覧のペインを閉じたら、新しい一覧のペイン（左上）へ
  const h = closePane(splitPane(base(), FIRST_PANE, "row", "after", "p1", "c"), FIRST_PANE, (k) => k !== "a");
  assert.deepEqual(h.closed, ["a"]);
  assert.equal(shape(h.layout.root), "p1[*c,b]");
});

test("returnToHome: 一覧のペインの後ろへ戻す（一覧の表示中のタブ・ピントは変えない）。空になったペインは消す", () => {
  const l1 = moveTab(splitPane(base(), FIRST_PANE, "row", "after", "p1", "c"), "a", "p1");
  const r = returnToHome(l1, "c");
  assert.equal(shape(r.root), `row(0.50:${FIRST_PANE}[*b,c] 0.50:p1[*a])`);
  assert.equal(r.focused, "p1");
  const gone = returnToHome(r, "a");
  assert.equal(shape(gone.root), `${FIRST_PANE}[*b,c,a]`);
  // 一覧のペインのタブ・知らないタブでは何もしない
  assert.equal(returnToHome(r, "b"), r);
  assert.equal(returnToHome(r, "zzz"), r);
});

test("nextActiveTab: 表示中のタブを閉じたら、同じ位置に来たタブ（最後なら 1 つ前）", () => {
  const tabs = ["a", "b", "c"];
  assert.equal(nextActiveTab(tabs, "b", "b"), "c");
  assert.equal(nextActiveTab(tabs, "c", "c"), "b");
  assert.equal(nextActiveTab(tabs, "a", "a"), "b");
});

test("nextActiveTab: ほかのタブを閉じたなら表示中のまま。最後の 1 つを閉じたら null", () => {
  const tabs = ["a", "b", "c"];
  assert.equal(nextActiveTab(tabs, "a", "c"), "c");
  assert.equal(nextActiveTab(tabs, "b", null), null);
  assert.equal(nextActiveTab(["a"], "a", "a"), null);
  // 一覧にないキーでも落ちない
  assert.equal(nextActiveTab(tabs, "zzz", "zzz"), null);
});
