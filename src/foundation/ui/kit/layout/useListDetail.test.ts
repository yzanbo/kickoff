import assert from "node:assert/strict";
import { createElement, createRef } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { ListDetail } from "./ListDetail";
import { listDetailLayout, type ListDetailState } from "./useListDetail";
import { useElementSize } from "./useElementSize";

test("listDetailLayout: 狭いときは選んでいるかで 1 つずつ、広いときは両方（隠した一覧の代わりに帯）", () => {
  assert.deepEqual(listDetailLayout({ narrow: true, hidden: true, hasSelection: false }), { showList: true, showDetail: false, showRail: false });
  assert.deepEqual(listDetailLayout({ narrow: true, hidden: false, hasSelection: true }), { showList: false, showDetail: true, showRail: false });
  assert.deepEqual(listDetailLayout({ narrow: false, hidden: false, hasSelection: false }), { showList: true, showDetail: true, showRail: false });
  assert.deepEqual(listDetailLayout({ narrow: false, hidden: true, hasSelection: true }), { showList: false, showDetail: true, showRail: true });
});

test("ListDetail: 広いときは一覧（幅とつまみ）と詳細を並べ、隠した一覧の代わりに戻す帯を置く", () => {
  const state = (o: { narrow: boolean; hidden: boolean }): ListDetailState => ({
    rootRef: createRef(),
    listRef: createRef(),
    narrow: o.narrow,
    ...listDetailLayout({ ...o, hasSelection: true }),
    listStyle: o.narrow ? undefined : { width: 300 },
    handleProps: { role: "separator", "aria-orientation": "vertical", title: "", onPointerDown: () => {}, onDoubleClick: () => {} },
    hide: () => {},
    show: () => {},
  });
  const render = (s: ListDetailState) => renderToString(createElement(ListDetail, { state: s, list: "一覧", detail: "詳細", listLabel: "一覧を表示" }));
  const wide = render(state({ narrow: false, hidden: false }));
  assert.match(wide, /<aside class="list-detail-list" style="width:300px">一覧<div class="pane-resizer list-detail-resizer" role="separator"/);
  assert.match(wide, /詳細/);
  const hidden = render(state({ narrow: false, hidden: true }));
  assert.doesNotMatch(hidden, /<aside/);
  assert.match(hidden, /aria-label="一覧を表示"/);
  // 狭くて選んでいれば詳細だけ（つまみ・帯は出さない）
  const narrow = render(state({ narrow: true, hidden: false }));
  assert.match(narrow, /class="list-detail narrow"/);
  assert.doesNotMatch(narrow, /<aside|separator/);
});

test("useElementSize: 測るまでは null", () => {
  const Probe = () => String(useElementSize<HTMLDivElement>()[1]);
  assert.equal(renderToString(createElement(Probe)), "null");
});
