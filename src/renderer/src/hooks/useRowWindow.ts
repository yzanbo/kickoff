import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { buildMetrics, keepRange, rangeFor, releasable, runsOf, type RowMetrics, type Run, acceptRowSize } from "@/lib/rowLayout";
import { observeSize } from "./useSizeObserver";

/**
 * 画素で決める窓（メモの仕様書「0023_表示を軽くする」の案 22・分冊 2 の 1-3）。描く行を「項目の数」ではなく「見えている所からの距離（px）」で決め、
 * 窓の外を測った高さ（なければ見積もり）の箱にする。行はふつうの流れ（flex の縦並び・gap）のまま描くので、CSS・選択とコピー・scrollIntoView・
 * ブラウザのスクロールアンカー（読んでいた位置を保つ）はそのまま効く。
 * - 開いた直後は新しい側の端から見えている高さぶん（覚えた位置からなら、その前後）だけ描き、2 フレーム後にふだんの余裕へ広げる
 * - ふだんは見えている所 ± OVERSCAN。範囲から出た行はすぐ外さず、遠く（FAR）離れて IDLE_MS 見ていない行を手すきのときに箱にする
 * - 新しい側の端の行を描いている間に新しい項目が届いたら、それも描く（一番下に付いていく間に、新しい項目が箱で見えないように）
 * - 行の高さは共有の ResizeObserver で測り、sizes（呼ぶ側の店）に書く（描くのを省いている行の大きさは捨てる）。描き直しはしない
 * - 読んだ範囲の端に近づいたら onNearStart / onNearEnd（読み足しの口。案 4）
 * - 前に項目が増えた・上の行の高さが変わったときに読んでいる位置を保つのは、ブラウザのスクロールアンカー。前に項目が増えて合っていないとき
 *   （いちばん上 scrollTop 0 ではアンカーが効かない）だけ JS で直す（7b。アンカーを切って JS だけで保つ形と比べ、上へ 2,400px ずつ 20 回
 *   読み進めたずれは最大 0.7px 対 3,300px。JS で書くと慣性のスクロールも止まる）
 */

/** 描く範囲の余裕（見えている所の上下。画面の高さとの大きい方） */
const OVERSCAN_MIN_PX = 600;
/** 外す行の距離（画面の高さの 3 倍との大きい方）と、見ていない時間 */
const FAR_MIN_PX = 4800;
const FAR_VIEWPORTS = 3;
const IDLE_MS = 5000;
/** 読み足しを頼む、読んだ範囲の端からの距離（画面の高さの 1.5 倍との大きい方。端に着いてから頼むとトラックパッドの勢いが端で止まる） */
const NEAR_MIN_PX = 600;
const NEAR_VIEWPORTS = 1.5;
/** 移るときに先に描く、移り先の前後（画面の高さに対する割合。なめらかに動かす間に通る行を描いておく） */
const REVEAL_VIEWPORTS = 1.5;
/** 開いた直後に、ふだんの余裕へ広げるまでのフレーム数 */
const INITIAL_FRAMES = 2;
/** 移る処理（並びの入れ替え・reveal）のあと、読み足しを頼まない時間（移る前の位置が読んだ範囲の端にあっても、移る途中で前を読み足して行き先をずらさない） */
const QUIET_AFTER_REVEAL_MS = 1500;


/** 窓の中身を測るときの本文の幅と文字の倍率（幅は 30px 刻み。見積もりを作り直す合図） */
export interface RowLayoutContext {
  width: number;
  scale: number;
}

export interface RowWindowOptions<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** 測っていない行の高さ（px） */
  estimate: (item: T, layout: RowLayoutContext) => number;
  /** 測った高さを覚える所（チャットごとの見え方の店の sizes など） */
  sizes: { peek(key: string): number | undefined; set(key: string, value: number): void };
  /** 行を測った（見積もりの補正に使う） */
  onMeasured?: (item: T, height: number, layout: RowLayoutContext) => void;
  /** スクロールする枠 */
  scroller: RefObject<HTMLElement | null>;
  /** 行の並び（gap・本文の幅・文字の倍率をここから測る） */
  list: RefObject<HTMLElement | null>;
  /** "end" = 新しいものが下（会話の流れ）、"start" = 新しいものが上（動き） */
  newest: "end" | "start";
  /** 開いたときの位置（覚えた位置か、新しい側の端） */
  initial: { key: string; offset: number } | null;
  /** 変わったら窓を作り直す（チャットが替わった） */
  resetKey: unknown;
  /** 読んだ範囲の始まり（先頭の行の側）に近づいた */
  onNearStart?: () => void;
  /** 読んだ範囲の終わり（末尾の行の側）に近づいた */
  onNearEnd?: () => void;
  /** 描く行が変わって描き終えたら呼ぶ（チャットの中の検索が印を付け直す合図） */
  onDrawn?: () => void;
}

export interface RowWindow {
  runs: Run[];
  /** 描く行を変えた回数（変わったら、描いた DOM から決めるもの（上に貼り付ける指示）を確かめ直す） */
  version: number;
  /** 行の包みに付ける ref（測る。同じキーには同じ関数） */
  measureRef: (key: string) => (el: HTMLElement | null) => () => void;
  /** 行の包みに付けるスタイル（描くのを省いている間の大きさ --row-est。描いた時点の値のまま変えない） */
  rowStyle: (key: string) => CSSProperties;
  /** 行 index とその前後（around px。既定は画面の高さの 1.5 倍）を描き、描いて測り終えたら解決する（移る処理はこれを待ってから移る） */
  reveal: (index: number, around?: number) => Promise<void>;
  /** 新しい側の端へ（遠ければ 1 画面手前まで一気に寄せてから、smooth ならなめらかに） */
  toNewest: (smooth: boolean) => Promise<void>;
  /** 行 key の上端の、見えている上端からの距離（描いていない行は前からの和で。行がなければ undefined） */
  topOf: (key: string) => number | undefined;
  /** 読んでいた位置（見えている上端をまたぐ行のキーと、その行の上端から見えている上端までの距離。行がなければ null） */
  position: () => { key: string; offset: number } | null;
  /** スクロールした（範囲を決め直す） */
  onScroll: () => void;
}

/** 行の包みの重ねた余白（CSS の --row-ink。包みの上下に同じだけ取って外へ戻す余白）。測った高さからこの分を引く。なければ 0 */
function inkOf(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).getPropertyValue("--row-ink")) || 0;
}

/** 描くのを省いているか（content-visibility: auto で省かれている行は、中の要素が見えないと答える） */
function skippedRow(el: HTMLElement): boolean {
  const child = el.firstElementChild;
  return child !== null && typeof child.checkVisibility === "function" && !child.checkVisibility({ contentVisibilityAuto: true });
}

interface WindowState {
  resetKey: unknown;
  mounted: Set<string>;
  /** 新しい側の端の行のキーと、それを描いていたか */
  edge: { key: string | undefined; mounted: boolean };
  /** 開いた直後（余裕を広げる前） */
  initial: boolean;
  /** 開いたときに置く位置（置いたら null） */
  place: { key: string; offset: number } | "newest" | null;
  lastSeen: Map<string, number>;
  /** 描いた時点の --row-est */
  est: Map<string, number>;
  /** 見積もりの覚え（項目ごと。幅・倍率が変わったら捨てる） */
  estimates: WeakMap<object, number>;
  layout: RowLayoutContext;
  gap: number;
  /** 前からの和を作り直すか（測った高さが変わった） */
  dirty: boolean;
  /** 描き終えたら解決する移る処理 */
  waiting: (() => void)[];
  /** 行の要素（測っている間） */
  els: Map<string, HTMLElement>;
  refs: Map<string, (el: HTMLElement | null) => () => void>;
  releaseTimer: number | null;
  /** 描く行を変えた回数と、描き終えたと知らせた回数 */
  mountedVersion: number;
  drawnVersion: number;
  /** この時刻までは読み足しを頼まない */
  quietUntil: number;
  /** 描き終えた並びの最初の項目のキー（前に項目が増えたかを見る） */
  firstKey: string | undefined;
  /** 描く前に読んだ、見えている最初の行と、その上端（並びが前に増えたときに位置を直す） */
  anchor: { key: string; top: number } | null;
}

export function useRowWindow<T extends object>(opts: RowWindowOptions<T>): RowWindow {
  const latest = useRef(opts);
  latest.current = opts;
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const st = useRef<WindowState>(null as unknown as WindowState);
  const fresh = (): WindowState => ({
    resetKey: opts.resetKey,
    mounted: new Set(),
    edge: { key: undefined, mounted: false },
    initial: true,
    place: opts.initial ?? "newest",
    lastSeen: new Map(),
    est: new Map(),
    estimates: new WeakMap(),
    layout: st.current?.layout ?? { width: 0, scale: 1 },
    gap: st.current?.gap ?? 0,
    dirty: true,
    waiting: [],
    els: st.current?.els ?? new Map(),
    refs: st.current?.refs ?? new Map(),
    releaseTimer: null,
    mountedVersion: 0,
    drawnVersion: 0,
    quietUntil: 0,
    firstKey: undefined,
    anchor: null,
  });
  if (st.current === null || st.current.resetKey !== opts.resetKey) st.current = fresh();
  const s = st.current;

  const { items, keyOf, newest } = opts;
  const keys = useMemo(() => items.map(keyOf), [items, keyOf]);
  const indexOf = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);
  // あとから呼ばれる処理（知らせ・時計・移る処理）は、いちばん新しい描画の並びを読む
  const cur = useRef({ keys, indexOf });
  cur.current = { keys, indexOf };

  const heightOf = (item: T, key: string): number => {
    const measured = latest.current.sizes.peek(key);
    if (measured !== undefined) return measured;
    let e = s.estimates.get(item);
    if (e === undefined) {
      e = latest.current.estimate(item, s.layout);
      s.estimates.set(item, e);
    }
    return e;
  };
  // 前からの和（項目が変わった・測った高さが変わったときだけ作り直す）
  const metricsRef = useRef<{ items: readonly T[]; m: RowMetrics } | null>(null);
  const metrics = (): RowMetrics => {
    const cur = metricsRef.current;
    if (cur && cur.items === latest.current.items && !s.dirty) return cur.m;
    const list = latest.current.items;
    const hs = new Float64Array(list.length);
    for (let i = 0; i < list.length; i++) hs[i] = heightOf(list[i], keyOf(list[i]));
    const m = buildMetrics(hs, s.gap);
    metricsRef.current = { items: list, m };
    s.dirty = false;
    return m;
  };

  const viewport = () => latest.current.scroller.current?.clientHeight || window.innerHeight;
  /** 行 [start, end) を描く行に足す（足したら true） */
  const mountRange = (start: number, end: number): boolean => {
    const { keys } = cur.current;
    let added = false;
    for (let i = Math.max(0, start); i < Math.min(end, keys.length); i++) {
      if (!s.mounted.has(keys[i])) {
        s.mounted.add(keys[i]);
        added = true;
      }
    }
    if (added) s.mountedVersion++;
    return added;
  };
  /** 位置 px の範囲を覆う行を描く */
  const mountPx = (top: number, bottom: number): boolean => {
    const m = metrics();
    const r = rangeFor(m, { top, height: Math.max(0, bottom - top) }, 0, 0);
    return mountRange(r.start, r.end);
  };

  // ---- 描くたびに決めること（描いている間に決める。同じ入力なら同じ結果） ----
  // 描いていた行が 1 つも並びに残っていない（途中の一部分と末尾を入れ替えた）: 新しい側の端から描き直す。位置は動かさない
  // （入れ替えるのは遠い発言へ移る・一番下へ戻るときで、そのあと移る処理が行き先を描いて移る。ここで一番下へ寄せると、
  // 一番下に着いた知らせで付いていきに戻り、移っている途中で引き戻される）
  if (s.mounted.size > 0 && keys.length > 0 && ![...s.mounted].some((k) => indexOf.has(k))) {
    s.mounted.clear();
    s.est.clear();
    s.quietUntil = performance.now() + QUIET_AFTER_REVEAL_MS;
    const m = metrics();
    const total = m.offsets[keys.length];
    const vh = viewport();
    if (newest === "end") mountPx(total - vh, total);
    else mountPx(0, vh);
  }
  // 開いた直後: 新しい側の端（覚えた位置ならその前後）から見えている高さぶんだけ
  if (s.mounted.size === 0 && keys.length > 0) {
    const m = metrics();
    const vh = viewport();
    const place = s.place;
    const at = place !== null && place !== "newest" ? indexOf.get(place.key) : undefined;
    if (at !== undefined && place !== null && place !== "newest") {
      const top = m.offsets[at] + place.offset;
      mountPx(top, top + vh);
    } else {
      if (place !== null && place !== "newest") s.place = "newest";
      const total = m.offsets[keys.length];
      if (newest === "end") mountPx(total - vh, total);
      else mountPx(0, vh);
    }
  }
  // 新しい側の端の行を描いていたら、その先に届いた項目も描く
  const edgeIndex = newest === "end" ? keys.length - 1 : 0;
  const edgeKey = keys[edgeIndex];
  if (edgeKey !== s.edge.key) {
    const prev = s.edge.key === undefined ? undefined : indexOf.get(s.edge.key);
    if (s.edge.mounted && prev !== undefined) {
      if (newest === "end") mountRange(prev + 1, keys.length);
      else mountRange(0, prev);
    }
  }
  s.edge = { key: edgeKey, mounted: edgeKey !== undefined && s.mounted.has(edgeKey) };

  const mountedIdx = new Set<number>();
  for (const k of s.mounted) {
    const i = indexOf.get(k);
    if (i !== undefined) mountedIdx.add(i);
  }
  const runs = runsOf(metrics(), mountedIdx);

  // ---- 範囲を決め直す（スクロール・描いたあと） ----
  const view = (): { top: number; height: number; origin: number } | null => {
    const el = latest.current.scroller.current;
    if (!el || el.clientHeight === 0) return null;
    const origin = originOf();
    return { top: el.scrollTop - origin, height: el.clientHeight, origin };
  };
  /** 流れの最初の行の上端の、スクロールする中身の中での位置（描いている行の要素から逆算する） */
  const originOf = (): number => {
    const { indexOf } = cur.current;
    const el = latest.current.scroller.current;
    if (!el) return 0;
    const m = metrics();
    const box = el.getBoundingClientRect();
    for (const [key, row] of s.els) {
      const i = indexOf.get(key);
      if (i === undefined || m.heights[i] === 0 || !row.isConnected) continue;
      return row.getBoundingClientRect().top + inkOf(row) - box.top + el.scrollTop - m.offsets[i];
    }
    return 0;
  };

  const update = () => {
    const { keys } = cur.current;
    const el = latest.current.scroller.current;
    const v = view();
    if (!el || !v) return;
    const m = metrics();
    const vh = v.height;
    const over = s.initial ? 0 : Math.max(OVERSCAN_MIN_PX, vh);
    const r = rangeFor(m, v, s.initial ? 0 : over, s.initial ? OVERSCAN_MIN_PX : over);
    const added = mountRange(r.start, r.end);
    // 見ていた時刻（見えている行）
    const seen = rangeFor(m, v, 0, 0);
    const now = performance.now();
    for (let i = seen.start; i < seen.end; i++) s.lastSeen.set(keys[i], now);
    if (added) rerender();
    scheduleRelease();
    // 読んだ範囲の端に近づいた
    const near = Math.max(NEAR_MIN_PX, vh * NEAR_VIEWPORTS);
    const fromEnd = el.scrollHeight - el.scrollTop - vh;
    const { onNearStart, onNearEnd } = latest.current;
    if (now < s.quietUntil) return;
    if (el.scrollTop < near) onNearStart?.();
    if (fromEnd < near) onNearEnd?.();
  };

  const scheduleRelease = () => {
    if (s.releaseTimer !== null) return;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 200));
    s.releaseTimer = idle(() => {
      s.releaseTimer = null;
      release();
    }, { timeout: 2000 }) as unknown as number;
  };
  /** 遠くて見ていない行を外して箱にする（残す行は外さない） */
  const release = () => {
    const { keys, indexOf } = cur.current;
    const v = view();
    if (!v) return;
    const m = metrics();
    const over = Math.max(OVERSCAN_MIN_PX, v.height);
    const range = rangeFor(m, v, over, over);
    const selection = selectionKeep();
    const active = document.activeElement;
    const idx: number[] = [];
    for (const k of s.mounted) {
      const i = indexOf.get(k);
      if (i === undefined) s.mounted.delete(k);
      else idx.push(i);
    }
    const out = releasable({
      mounted: idx,
      range,
      m,
      view: v,
      far: Math.max(FAR_MIN_PX, v.height * FAR_VIEWPORTS),
      now: performance.now(),
      lastSeen: (i) => s.lastSeen.get(keys[i]) ?? 0,
      idleMs: IDLE_MS,
      keep: (i) => {
        if (selection && i >= selection.start && i < selection.end) return true;
        const row = s.els.get(keys[i]);
        // ピントがある・書いている欄がある（書き直し中の発言・伝える欄）・中を触った図・開いたメニュー
        return row !== undefined && ((active !== null && row.contains(active)) || row.querySelector("textarea, input, [data-keep-row]") !== null);
      },
    });
    if (out.length === 0) {
      // まだ外せない行が残っていれば、あとでもう一度
      if (idx.length > range.end - range.start) window.setTimeout(scheduleRelease, IDLE_MS);
      return;
    }
    for (const i of out) s.mounted.delete(keys[i]);
    s.mountedVersion++;
    rerender();
  };
  /** 選択の端の行（流れの中の行の番号。流れの前は -1、後ろは n） */
  const selectionKeep = (): { start: number; end: number } | null => {
    const { keys, indexOf } = cur.current;
    const sel = document.getSelection();
    const list = latest.current.list.current;
    if (!sel || sel.isCollapsed || !list) return null;
    const indexOfNode = (node: Node | null): number => {
      if (!node) return -1;
      if (!list.contains(node)) return list.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING ? -1 : keys.length;
      for (let el: Element | null = node instanceof Element ? node : node.parentElement; el && el !== list; el = el.parentElement) {
        const key = (el as HTMLElement).dataset?.rowKey;
        if (key !== undefined) return indexOf.get(key) ?? -1;
      }
      return keys.length;
    };
    return keepRange(indexOfNode(sel.anchorNode), indexOfNode(sel.focusNode), keys.length);
  };

  // 本文の幅・文字の倍率・gap（付けたときと、幅が変わったとき）
  useLayoutEffect(() => {
    const list = opts.list.current;
    if (!list) return;
    const read = () => {
      const cs = getComputedStyle(list);
      const width = Math.round((list.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)) / 30) * 30;
      const scale = parseFloat(cs.getPropertyValue("--chat-scale")) || 1;
      const gap = parseFloat(cs.rowGap) || 0;
      if (width === s.layout.width && scale === s.layout.scale && gap === s.gap) return;
      s.layout = { width, scale };
      s.gap = gap;
      s.estimates = new WeakMap();
      s.dirty = true;
    };
    read();
    return observeSize(list, read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.list, s]);

  // 描いたあと: 開いたときの位置に置く・移る処理を解決する・範囲を決め直す
  useLayoutEffect(() => {
    const el = latest.current.scroller.current;
    // 前に項目が増えた: 見えていた行が同じ所に残るよう直す。ブラウザのスクロールアンカーが合わせていれば書かない
    // （書くと慣性のスクロールが止まる。いちばん上（scrollTop が 0）ではアンカーが効かないので、そこで直すことになる）
    const anchor = s.anchor;
    s.anchor = null;
    s.firstKey = cur.current.keys[0];
    if (el && anchor && s.place === null) {
      const top = topOf(anchor.key);
      if (top !== undefined && Math.abs(top - anchor.top) > 1) el.scrollTop += top - anchor.top;
    }
    if (el && s.place !== null && el.clientHeight > 0) {
      const place = s.place;
      s.place = null;
      if (place === "newest") el.scrollTop = latest.current.newest === "end" ? el.scrollHeight : 0;
      else {
        const top = topOf(place.key);
        if (top !== undefined) el.scrollTop += top + place.offset;
      }
      // 最初の描画が画面に出てから、ふだんの余裕へ広げる
      if (s.initial) {
        let frames = INITIAL_FRAMES;
        const tick = () => {
          if (--frames > 0) return void requestAnimationFrame(tick);
          s.initial = false;
          update();
        };
        requestAnimationFrame(tick);
      }
    }
    if (s.waiting.length > 0) {
      const waiting = s.waiting;
      s.waiting = [];
      // 描いた行を測り終えるまで（次のフレームの大きさの知らせのあと）待つ
      requestAnimationFrame(() => requestAnimationFrame(() => waiting.forEach((done) => done())));
    }
    if (s.mountedVersion !== s.drawnVersion) {
      s.drawnVersion = s.mountedVersion;
      latest.current.onDrawn?.();
    }
    if (!s.initial) update();
  });

  // 外したあとの時計を止める
  useLayoutEffect(
    () => () => {
      if (s.releaseTimer !== null) (window.cancelIdleCallback ?? window.clearTimeout)(s.releaseTimer);
      s.releaseTimer = null;
    },
    [s],
  );

  const topOf = (key: string): number | undefined => {
    const el = latest.current.scroller.current;
    const i = cur.current.indexOf.get(key);
    if (!el || i === undefined) return undefined;
    const row = s.els.get(key);
    const box = el.getBoundingClientRect();
    if (row?.isConnected) return row.getBoundingClientRect().top + inkOf(row) - box.top;
    return metrics().offsets[i] + originOf() - el.scrollTop;
  };

  const measureRef = (key: string) => {
    let ref = s.refs.get(key);
    if (!ref) {
      ref = (el: HTMLElement | null) => {
        if (!el) return () => {};
        s.els.set(key, el);
        const ink = inkOf(el);
        // 何も描かない行（null を返す記録）は場所を取らない
        if (el.firstChild === null && latest.current.sizes.peek(key) !== 0) {
          latest.current.sizes.set(key, 0);
          s.dirty = true;
        }
        const off = observeSize(el, (size) => {
          const height = Math.max(0, size.height - 2 * ink);
          const prev = latest.current.sizes.peek(key);
          if (!acceptRowSize({ skipped: skippedRow(el), prev, next: { width: size.width, height } })) return;
          latest.current.sizes.set(key, height);
          s.dirty = true;

          const i = cur.current.indexOf.get(key);
          const item = i === undefined ? undefined : latest.current.items[i];
          if (item && prev === undefined) latest.current.onMeasured?.(item, height, s.layout);
        });
        return () => {
          off();
          if (s.els.get(key) === el) s.els.delete(key);
          s.est.delete(key);
        };
      };
      s.refs.set(key, ref);
    }
    return ref;
  };

  const rowStyle = (key: string): CSSProperties => {
    let est = s.est.get(key);
    if (est === undefined) {
      const i = indexOf.get(key);
      est = i === undefined ? 120 : Math.round(heightOf(items[i], key));
      s.est.set(key, est);
    }
    return { "--row-est": `${Math.max(1, est)}px` } as CSSProperties;
  };

  const reveal = (index: number, around?: number): Promise<void> => {
    const { keys } = cur.current;
    if (index < 0 || index >= keys.length) return Promise.resolve();
    const m = metrics();
    const pad = around ?? viewport() * REVEAL_VIEWPORTS;
    const r = rangeFor(m, { top: m.offsets[index], height: m.offsets[index + 1] - m.offsets[index] }, pad, pad);
    for (let i = r.start; i < r.end; i++) s.lastSeen.set(keys[i], performance.now());
    s.quietUntil = performance.now() + QUIET_AFTER_REVEAL_MS;
    if (!mountRange(r.start, r.end)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      s.waiting.push(resolve);
      rerender();
    });
  };

  const toNewest = async (smooth: boolean) => {
    const { keys } = cur.current;
    const el = latest.current.scroller.current;
    if (!el) return;
    const m = metrics();
    const vh = viewport();
    const total = m.offsets[keys.length];
    const edge = newest === "end" ? rangeFor(m, { top: total - vh * REVEAL_VIEWPORTS, height: vh * REVEAL_VIEWPORTS }, 0, 0) : rangeFor(m, { top: 0, height: vh * REVEAL_VIEWPORTS }, 0, 0);
    if (mountRange(edge.start, edge.end)) {
      await new Promise<void>((resolve) => {
        s.waiting.push(resolve);
        rerender();
      });
    }
    const target = newest === "end" ? el.scrollHeight - el.clientHeight : 0;
    // 遠ければ、なめらかに動かす前に 1 画面手前まで一気に寄せる（箱の中を長くなめらかに動かすと、通る行を毎フレーム描くため）
    if (Math.abs(target - el.scrollTop) > vh * REVEAL_VIEWPORTS) el.scrollTop = target - Math.sign(target - el.scrollTop) * vh;
    el.scrollTo({ top: newest === "end" ? el.scrollHeight : 0, behavior: smooth ? "smooth" : "instant" });
  };

  const position = (): { key: string; offset: number } | null => {
    const el = latest.current.scroller.current;
    if (!el || el.clientHeight === 0) return null;
    const box = el.getBoundingClientRect();
    let best: { key: string; top: number } | null = null;
    for (const [key, row] of s.els) {
      if (!row.isConnected || cur.current.indexOf.get(key) === undefined) continue;
      const r = row.getBoundingClientRect();
      const ink = inkOf(row);
      if (r.bottom - ink <= box.top) continue;
      const top = r.top + ink;
      if (!best || top < best.top) best = { key, top };
    }
    return best ? { key: best.key, offset: box.top - best.top } : null;
  };

  // 前に項目が増えるときは、描く前の位置を読んでおく
  if (s.firstKey !== undefined && keys[0] !== s.firstKey && s.anchor === null) {
    const at = position();
    if (at) s.anchor = { key: at.key, top: -at.offset };
  }

  return { runs, version: s.mountedVersion, measureRef, rowStyle, reveal, toNewest, topOf, position, onScroll: update };
}
