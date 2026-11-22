import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { createCell } from "@/foundation/ui/store";
import { keepsRow, originOf, positionOf, selectionRange, topOfRow } from "./rowDom";
import { createRowHeights } from "./rowHeights";
import { rangeFor, runsOf, type Run } from "./rowLayout";
import type { RowWindow, RowWindowOptions } from "./rowWindowTypes";
import {
  IDLE_MS,
  REVEAL_VIEWPORTS,
  initialRowWindow,
  mountRange,
  mountView,
  mountedIndexes,
  nearEdges,
  newestRange,
  releaseRows,
  revealRows,
  settleItems,
  type RowWindowState,
} from "./rowWindowState";

/**
 * 画素で決める窓。描く行を「項目の数」ではなく「見えている所からの距離（px）」で決め、
 * 窓の外を測った高さ（なければ見積もり）の箱にする。行はふつうの流れ（flex の縦並び・gap）のまま描くので、CSS・選択とコピー・scrollIntoView・
 * ブラウザのスクロールアンカー（読んでいた位置を保つ）はそのまま効く。どの行を描くかの決まりは rowWindowState.ts（純粋）、ここは DOM の口。
 * - 開いた直後は新しい側の端から見えている高さぶん（覚えた位置からなら、その前後）だけ描き、2 フレーム後にふだんの余裕へ広げる
 * - 範囲から出た行はすぐ外さず、遠く離れて見ていない行を手すきのときに箱にする（選択・ピント・書く欄・[data-keep-row] の行は残す）
 * - 行の高さは共有の ResizeObserver で測り、sizes（呼ぶ側の店）に書く（描くのを省いている行の大きさは捨てる）。描き直しはしない
 * - 読んだ範囲の端に近づいたら onNearStart / onNearEnd（読み足しの口）
 * - 前に項目が増えた・上の行の高さが変わったときに読んでいる位置を保つのは、ブラウザのスクロールアンカー。前に項目が増えて合っていないとき
 *   （いちばん上 scrollTop 0 ではアンカーが効かない）だけ JS で直す（7b。アンカーを切って JS だけで保つ形と比べ、上へ 2,400px ずつ 20 回
 *   読み進めたずれは最大 0.7px 対 3,300px。JS で書くと慣性のスクロールも止まる）
 */

/** 開いた直後に、ふだんの余裕へ広げるまでのフレーム数 */
const INITIAL_FRAMES = 2;

const UNSET = Symbol("unset");

/**
 * 窓の操る物: 状態（RowWindowState）と、行の要素・高さの覚え・時計を持つ。描き直すときは ticks を進める。
 * frame は描く中で呼ぶ（並びが変わったときの判断と、前に増えるときの位置を読む。同じ入力なら同じ結果）。DOM を書くのは afterDraw（useLayoutEffect）から
 */
function createRowWindow<T extends object>() {
  const ticks = createCell(0);
  let opts!: RowWindowOptions<T>;
  let resetKey: unknown = UNSET;
  /** 作り直した回数（作り直す前に予約した広げる処理を捨てる） */
  let generation = 0;
  let state: RowWindowState = initialRowWindow("newest");
  const heights = createRowHeights<T>(() => opts);
  const { metrics, rows } = heights;
  /** 見ていた時刻（行のキーごと） */
  const lastSeen = new Map<string, number>();
  /** 描き終えたら解決する移る処理 */
  let waiting: (() => void)[] = [];
  let releaseTimer: number | null = null;
  let drawnVersion = 0;
  /** 描き終えた並びの最初の項目のキーと、描く前に読んだ見えている最初の行とその上端（並びが前に増えたときに位置を直す） */
  let firstKey: string | undefined;
  let anchor: { key: string; top: number } | null = null;

  const rerender = () => ticks.set((n) => n + 1);
  const cancelRelease = () => {
    if (releaseTimer !== null) (window.cancelIdleCallback ?? window.clearTimeout)(releaseTimer);
    releaseTimer = null;
  };
  const reset = (o: RowWindowOptions<T>) => {
    resetKey = o.resetKey;
    generation++;
    state = initialRowWindow(o.initial ?? "newest");
    lastSeen.clear();
    heights.reset();
    waiting = [];
    cancelRelease();
    drawnVersion = 0;
    firstKey = undefined;
    anchor = null;
  };

  const frameOf = heights.frame;
  const viewport = () => opts.scroller.current?.clientHeight || window.innerHeight;
  const view = (): { top: number; height: number } | null => {
    const el = opts.scroller.current;
    if (!el || el.clientHeight === 0) return null;
    return { top: el.scrollTop - originOf(el, rows(), metrics()), height: el.clientHeight };
  };

  // ---- 範囲を決め直す（スクロール・描いたあと） ----
  const update = () => {
    const el = opts.scroller.current;
    const v = view();
    if (!el || !v) return;
    const f = frameOf();
    const next = mountView(state, f, v);
    const added = next !== state;
    state = next;
    const seen = rangeFor(f.m, v, 0, 0);
    const now = performance.now();
    for (let i = seen.start; i < seen.end; i++) lastSeen.set(f.keys[i], now);
    if (added) rerender();
    scheduleRelease();
    const near = nearEdges(state, { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, height: v.height }, now);
    if (near.start) opts.onNearStart?.();
    if (near.end) opts.onNearEnd?.();
  };
  const scheduleRelease = () => {
    if (releaseTimer !== null) return;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 200));
    releaseTimer = idle(() => {
      releaseTimer = null;
      release();
    }, { timeout: 2000 }) as unknown as number;
  };
  const release = () => {
    const v = view();
    if (!v) return;
    const f = frameOf();
    const selection = selectionRange(opts.list.current, f.keys, f.indexOf);
    const active = document.activeElement;
    const r = releaseRows(state, f, {
      view: v,
      now: performance.now(),
      lastSeen: (key) => lastSeen.get(key) ?? 0,
      keep: (i) => (selection !== null && i >= selection.start && i < selection.end) || keepsRow(rows().els.get(f.keys[i]), active),
    });
    state = r.state;
    if (r.retry) window.setTimeout(scheduleRelease, IDLE_MS);
    if (r.changed) rerender();
  };
  const topOf = (key: string): number | undefined => {
    const el = opts.scroller.current;
    return el ? topOfRow(el, rows(), metrics, key) : undefined;
  };
  const position = (): { key: string; offset: number } | null => {
    const el = opts.scroller.current;
    return el ? positionOf(el, rows()) : null;
  };
  /** 描く行を足したら、描いて測り終えるまで待つ */
  const drawn = () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve);
      rerender();
    });

  return {
    subscribe: ticks.subscribe,
    /** 描き直しの合図（変わったら frame を呼び直す） */
    tick: ticks.get,
    /** 描く中: 並びを当てて、描く行と箱を返す（tick は描き直しの合図。結果を覚えるときの入力に入れるため受け取る） */
    frame(o: RowWindowOptions<T>, _tick: number): { runs: Run[]; version: number } {
      if (o.resetKey !== resetKey) reset(o);
      opts = o;
      const f = frameOf();
      const settled = settleItems(state, f, { newest: o.newest, viewport, now: () => performance.now() });
      if (settled.replaced) heights.replaced();
      state = settled.state;
      const runs = runsOf(f.m, mountedIndexes(state, f.indexOf));
      // 前に項目が増えるときは、描く前の位置を読んでおく
      if (firstKey !== undefined && f.keys[0] !== firstKey && anchor === null) {
        const at = position();
        if (at) anchor = { key: at.key, top: -at.offset };
      }
      return { runs, version: state.version };
    },
    /** 本文の幅・文字の倍率・gap を読み、変わったら箱を描き直す（片付けの関数を返す） */
    observeLayout: (list: RefObject<HTMLElement | null>) => (list.current ? heights.observeLayout(list.current, rerender) : undefined),
    /** 描いたあと: 前に増えた分の位置を直す・開いたときの位置に置く・移る処理を解決する・範囲を決め直す */
    afterDraw() {
      const el = opts.scroller.current;
      // 前に項目が増えた: 見えていた行が同じ所に残るよう直す。ブラウザのスクロールアンカーが合わせていれば書かない
      // （書くと慣性のスクロールが止まる。いちばん上（scrollTop が 0）ではアンカーが効かないので、そこで直すことになる）
      const a = anchor;
      anchor = null;
      firstKey = frameOf().keys[0];
      if (el && a && state.place === null) {
        const top = topOf(a.key);
        if (top !== undefined && Math.abs(top - a.top) > 1) el.scrollTop += top - a.top;
      }
      if (el && state.place !== null && el.clientHeight > 0) {
        const place = state.place;
        state = { ...state, place: null };
        if (place === "newest") el.scrollTop = opts.newest === "end" ? el.scrollHeight : 0;
        else {
          const top = topOf(place.key);
          if (top !== undefined) el.scrollTop += top + place.offset;
        }
        // 最初の描画が画面に出てから、ふだんの余裕へ広げる
        if (state.initial) {
          const gen = generation;
          let frames = INITIAL_FRAMES;
          const next = () => {
            if (gen !== generation) return;
            if (--frames > 0) return void requestAnimationFrame(next);
            state = { ...state, initial: false };
            update();
          };
          requestAnimationFrame(next);
        }
      }
      if (waiting.length > 0) {
        const done = waiting;
        waiting = [];
        // 描いた行を測り終えるまで（次のフレームの大きさの知らせのあと）待つ
        requestAnimationFrame(() => requestAnimationFrame(() => done.forEach((resolve) => resolve())));
      }
      if (state.version !== drawnVersion) {
        drawnVersion = state.version;
        opts.onDrawn?.();
      }
      if (!state.initial) update();
    },
    /** 外したあとの時計を止める */
    stop: cancelRelease,
    update,
    topOf,
    position,
    measureRef: heights.measureRef,
    rowStyle: heights.rowStyle,
    reveal(index: number, around?: number): Promise<void> {
      const f = frameOf();
      if (index < 0 || index >= f.keys.length) return Promise.resolve();
      const now = performance.now();
      const r = revealRows(state, f, index, around ?? viewport() * REVEAL_VIEWPORTS, now);
      for (let i = r.range.start; i < r.range.end; i++) lastSeen.set(f.keys[i], now);
      const added = r.state.version !== state.version;
      state = r.state;
      return added ? drawn() : Promise.resolve();
    },
    async toNewest(smooth: boolean) {
      const el = opts.scroller.current;
      if (!el) return;
      const f = frameOf();
      const vh = viewport();
      const { newest } = opts;
      const edge = newestRange(f, newest, vh);
      const next = mountRange(state, f.keys, edge.start, edge.end);
      if (next !== state) {
        state = next;
        await drawn();
      }
      const target = newest === "end" ? el.scrollHeight - el.clientHeight : 0;
      // 遠ければ、なめらかに動かす前に 1 画面手前まで一気に寄せる（箱の中を長くなめらかに動かすと、通る行を毎フレーム描くため）
      if (Math.abs(target - el.scrollTop) > vh * REVEAL_VIEWPORTS) el.scrollTop = target - Math.sign(target - el.scrollTop) * vh;
      el.scrollTo({ top: newest === "end" ? el.scrollHeight : 0, behavior: smooth ? "smooth" : "instant" });
    },
  };
}

export function useRowWindow<T extends object>(opts: RowWindowOptions<T>): RowWindow {
  const [win] = useState(() => createRowWindow<T>());
  const tick = useSyncExternalStore(win.subscribe, win.tick);
  const { runs, version } = win.frame(opts, tick);
  const { list } = opts;
  useLayoutEffect(() => win.observeLayout(list), [win, list]);
  useLayoutEffect(() => win.afterDraw());
  useLayoutEffect(() => win.stop, [win]);
  return { runs, version, measureRef: win.measureRef, rowStyle: win.rowStyle, reveal: win.reveal, toNewest: win.toNewest, topOf: win.topOf, position: win.position, onScroll: win.update };
}
