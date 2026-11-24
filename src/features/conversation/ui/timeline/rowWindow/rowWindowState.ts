import { rangeFor, releasable, type RowMetrics } from "./rowLayout";

/**
 * 画素で決める窓（useRowWindow）の状態機械（純粋）。描く行・新しい側の端・開いたときの位置・移る処理のあとの静かな間を、
 * 並び（キーと前からの和）と見えている所から決める。DOM を測る・行の要素を持つ・時計を回すのは useRowWindow
 */

/** 描く範囲の余裕（見えている所の上下。画面の高さとの大きい方） */
const OVERSCAN_MIN_PX = 600;
/** 外す行の距離（画面の高さの 3 倍との大きい方）と、見ていない時間 */
const FAR_MIN_PX = 4800;
const FAR_VIEWPORTS = 3;
export const IDLE_MS = 5000;
/** 読み足しを頼む、読んだ範囲の端からの距離（画面の高さの 1.5 倍との大きい方。端に着いてから頼むとトラックパッドの勢いが端で止まる） */
const NEAR_MIN_PX = 600;
const NEAR_VIEWPORTS = 1.5;
/** 移るときに先に描く、移り先の前後（画面の高さに対する割合。なめらかに動かす間に通る行を描いておく） */
export const REVEAL_VIEWPORTS = 1.5;
/** 移る処理（並びの入れ替え・reveal）のあと、読み足しを頼まない時間（移る前の位置が読んだ範囲の端にあっても、移る途中で前を読み足して行き先をずらさない） */
export const QUIET_AFTER_REVEAL_MS = 1500;

/** 開いたときに置く位置（覚えた位置・新しい側の端。置いたら null） */
export type RowPlace = { key: string; offset: number } | "newest" | null;
/** "end" = 新しいものが下（会話の流れ）、"start" = 新しいものが上（動き） */
export type RowNewest = "end" | "start";

export interface RowWindowState {
  /** 描く行のキー */
  mounted: ReadonlySet<string>;
  /** 描く行を変えた回数 */
  version: number;
  /** 新しい側の端の行のキーと、それを描いていたか */
  edge: { key: string | undefined; mounted: boolean };
  /** 開いた直後（余裕を広げる前） */
  initial: boolean;
  place: RowPlace;
  /** この時刻までは読み足しを頼まない */
  quietUntil: number;
}

/** 並びの見方（キーと番号・前からの和） */
export interface RowFrame {
  keys: readonly string[];
  indexOf: ReadonlyMap<string, number>;
  m: RowMetrics;
}

export const initialRowWindow = (place: RowPlace): RowWindowState => ({
  mounted: new Set(),
  version: 0,
  edge: { key: undefined, mounted: false },
  initial: true,
  place,
  quietUntil: 0,
});

/** 行 [start, end) を描く行に足す（足さなければ同じ state） */
export function mountRange(state: RowWindowState, keys: readonly string[], start: number, end: number): RowWindowState {
  let next: Set<string> | null = null;
  for (let i = Math.max(0, start); i < Math.min(end, keys.length); i++) {
    if (state.mounted.has(keys[i])) continue;
    next ??= new Set(state.mounted);
    next.add(keys[i]);
  }
  return next ? { ...state, mounted: next, version: state.version + 1 } : state;
}

/** 位置 px の範囲を覆う行を描く */
const mountPx = (state: RowWindowState, f: RowFrame, top: number, bottom: number): RowWindowState => {
  const r = rangeFor(f.m, { top, height: Math.max(0, bottom - top) }, 0, 0);
  return mountRange(state, f.keys, r.start, r.end);
};

/** 新しい側の端から見えている高さぶん */
const mountNewest = (state: RowWindowState, f: RowFrame, newest: RowNewest, vh: number): RowWindowState => {
  const total = f.m.offsets[f.keys.length];
  return newest === "end" ? mountPx(state, f, total - vh, total) : mountPx(state, f, 0, vh);
};

/**
 * 並びを描く前に決めること（同じ並びなら同じ state を返す）。replaced = 描いていた行が 1 つも並びに残っていない（途中の一部分と末尾を入れ替えた）
 * - 入れ替えたら新しい側の端から描き直す。位置は動かさない（入れ替えるのは遠い発言へ移る・一番下へ戻るときで、そのあと移る処理が行き先を描いて移る。
 *   ここで一番下へ寄せると、一番下に着いた知らせで付いていきに戻り、移っている途中で引き戻される）
 * - 開いた直後は、新しい側の端（覚えた位置ならその前後）から見えている高さぶんだけ
 * - 新しい側の端の行を描いていたら、その先に届いた項目も描く（一番下に付いていく間に、新しい項目が箱で見えないように）
 */
export function settleItems(
  state: RowWindowState,
  f: RowFrame,
  ctx: { newest: RowNewest; viewport: () => number; now: () => number },
): { state: RowWindowState; replaced: boolean } {
  const { keys, indexOf } = f;
  let s = state;
  const replaced = s.mounted.size > 0 && keys.length > 0 && ![...s.mounted].some((k) => indexOf.has(k));
  if (replaced) s = mountNewest({ ...s, mounted: new Set(), quietUntil: ctx.now() + QUIET_AFTER_REVEAL_MS }, f, ctx.newest, ctx.viewport());
  if (s.mounted.size === 0 && keys.length > 0) {
    const vh = ctx.viewport();
    const place = s.place;
    const at = place !== null && place !== "newest" ? indexOf.get(place.key) : undefined;
    if (at !== undefined && place !== null && place !== "newest") {
      const top = f.m.offsets[at] + place.offset;
      s = mountPx(s, f, top, top + vh);
    } else {
      if (place !== null && place !== "newest") s = { ...s, place: "newest" };
      s = mountNewest(s, f, ctx.newest, vh);
    }
  }
  const edgeKey = keys[ctx.newest === "end" ? keys.length - 1 : 0];
  if (edgeKey !== s.edge.key) {
    const prev = s.edge.key === undefined ? undefined : indexOf.get(s.edge.key);
    if (s.edge.mounted && prev !== undefined) s = ctx.newest === "end" ? mountRange(s, keys, prev + 1, keys.length) : mountRange(s, keys, 0, prev);
  }
  const edgeMounted = edgeKey !== undefined && s.mounted.has(edgeKey);
  if (edgeKey !== s.edge.key || edgeMounted !== s.edge.mounted) s = { ...s, edge: { key: edgeKey, mounted: edgeMounted } };
  return { state: s, replaced };
}

/** 描く行の番号 */
export function mountedIndexes(state: RowWindowState, indexOf: ReadonlyMap<string, number>): Set<number> {
  const out = new Set<number>();
  for (const k of state.mounted) {
    const i = indexOf.get(k);
    if (i !== undefined) out.add(i);
  }
  return out;
}

/** スクロールした・描いたあと: 見えている所 ± 余裕を描く（開いた直後は余裕なし、下だけ OVERSCAN_MIN_PX） */
export function mountView(state: RowWindowState, f: RowFrame, view: { top: number; height: number }): RowWindowState {
  const over = state.initial ? 0 : Math.max(OVERSCAN_MIN_PX, view.height);
  const r = rangeFor(f.m, view, state.initial ? 0 : over, state.initial ? OVERSCAN_MIN_PX : over);
  return mountRange(state, f.keys, r.start, r.end);
}

/** 読んだ範囲の端に近づいたか（移る処理のあとの静かな間は頼まない） */
export function nearEdges(state: RowWindowState, el: { scrollTop: number; scrollHeight: number; height: number }, now: number): { start: boolean; end: boolean } {
  if (now < state.quietUntil) return { start: false, end: false };
  const near = Math.max(NEAR_MIN_PX, el.height * NEAR_VIEWPORTS);
  return { start: el.scrollTop < near, end: el.scrollHeight - el.scrollTop - el.height < near };
}

/**
 * 遠くて見ていない行を外して箱にする（並びにない行は数えずに落とす）。changed = 外した（描き直す）、
 * retry = まだ外せない行が残っている（あとでもう一度）
 */
export function releaseRows(
  state: RowWindowState,
  f: RowFrame,
  args: { view: { top: number; height: number }; now: number; lastSeen: (key: string) => number; keep: (i: number) => boolean },
): { state: RowWindowState; changed: boolean; retry: boolean } {
  const { view } = args;
  const over = Math.max(OVERSCAN_MIN_PX, view.height);
  const range = rangeFor(f.m, view, over, over);
  const idx: number[] = [];
  const mounted = new Set<string>();
  for (const k of state.mounted) {
    const i = f.indexOf.get(k);
    if (i === undefined) continue;
    idx.push(i);
    mounted.add(k);
  }
  const out = releasable({
    mounted: idx,
    range,
    m: f.m,
    view,
    far: Math.max(FAR_MIN_PX, view.height * FAR_VIEWPORTS),
    now: args.now,
    lastSeen: (i) => args.lastSeen(f.keys[i]),
    idleMs: IDLE_MS,
    keep: args.keep,
  });
  const pruned = mounted.size === state.mounted.size ? state : { ...state, mounted };
  if (out.length === 0) return { state: pruned, changed: false, retry: idx.length > range.end - range.start };
  for (const i of out) mounted.delete(f.keys[i]);
  return { state: { ...state, mounted, version: state.version + 1 }, changed: true, retry: false };
}

/** 移る処理: 行 index とその前後 pad px を描き、しばらく読み足しを頼まない（range は見たことにする行） */
export function revealRows(state: RowWindowState, f: RowFrame, index: number, pad: number, now: number): { state: RowWindowState; range: { start: number; end: number } } {
  const range = rangeFor(f.m, { top: f.m.offsets[index], height: f.m.offsets[index + 1] - f.m.offsets[index] }, pad, pad);
  return { state: mountRange({ ...state, quietUntil: now + QUIET_AFTER_REVEAL_MS }, f.keys, range.start, range.end), range };
}

/** 新しい側の端へ移る前に描く行（端から見えている高さの 1.5 倍） */
export function newestRange(f: RowFrame, newest: RowNewest, vh: number): { start: number; end: number } {
  const total = f.m.offsets[f.keys.length];
  const h = vh * REVEAL_VIEWPORTS;
  return rangeFor(f.m, newest === "end" ? { top: total - h, height: h } : { top: 0, height: h }, 0, 0);
}
