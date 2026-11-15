import { useCallback, useLayoutEffect, useRef } from "react";

/** 要素の大きさ（枠を含む。ResizeObserver の borderBoxSize） */
export interface ElementSize {
  width: number;
  height: number;
}

type SizeListener = (size: ElementSize, el: Element) => void;

/** これより小さい変化は知らせない（小数の丸めで行き来する分） */
const SIZE_EPSILON_PX = 0.5;

/**
 * 大きさが変わったとして知らせるか。0.5px 未満の変化は知らせない。
 * 0 × 0（見えていない: display: none のタブ・動きを見せている間の会話）は知らせない（測った値を 0 で上書きしないため）
 */
export function sizeChanged(prev: ElementSize | null, next: ElementSize): boolean {
  if (next.width === 0 && next.height === 0) return false;
  if (!prev) return true;
  return Math.abs(prev.width - next.width) >= SIZE_EPSILON_PX || Math.abs(prev.height - next.height) >= SIZE_EPSILON_PX;
}

interface Watched {
  listeners: Set<SizeListener>;
  /** 前に知らせた大きさ（まだなければ null） */
  last: ElementSize | null;
  /** あとから足した、まだ 1 回も知らせていない受け手（変わっていなくても、次の知らせで今の大きさを渡す） */
  fresh: Set<SizeListener>;
}

/**
 * 大きさの見張りを作る（画面は下のモジュールの 1 つを使い、テストはこれで作る）。
 * ResizeObserver を 1 つだけ作って使い回す（要素ごとに作ると、知らせが別々の束で届き、そのたびに当て直すことになる）。
 * 大きさは知らせの borderBoxSize から読む（offsetHeight を読まない = レイアウトを強いない）。知らせはレイアウトのあと・描く前に届く
 */
export function createSizeObservers() {
  const watched = new Map<Element, Watched>();
  let observer: ResizeObserver | null = null;
  const onResize = (entries: ResizeObserverEntry[]) => {
    for (const entry of entries) {
      const w = watched.get(entry.target);
      if (!w) continue;
      const box = entry.borderBoxSize?.[0];
      const size = box ? { width: box.inlineSize, height: box.blockSize } : { width: entry.contentRect.width, height: entry.contentRect.height };
      const changed = sizeChanged(w.last, size);
      if (changed) w.last = size;
      const visible = size.width !== 0 || size.height !== 0;
      for (const listener of [...w.listeners]) {
        if (changed || (visible && w.fresh.has(listener))) listener(size, entry.target);
      }
      if (visible) w.fresh.clear();
    }
  };
  /** el の大きさが変わったら listener を呼ぶ（付けた直後にも 1 回）。返す関数でやめる */
  const observeSize = (el: Element, listener: SizeListener): (() => void) => {
    observer ??= new ResizeObserver(onResize);
    const w = watched.get(el);
    if (w) {
      // もう見ている要素: 付け直して、次の知らせで今の大きさを新しい受け手に渡す
      w.listeners.add(listener);
      w.fresh.add(listener);
      observer.unobserve(el);
      observer.observe(el);
    } else {
      watched.set(el, { listeners: new Set([listener]), last: null, fresh: new Set() });
      observer.observe(el);
    }
    return () => {
      const cur = watched.get(el);
      if (!cur) return;
      cur.listeners.delete(listener);
      cur.fresh.delete(listener);
      if (cur.listeners.size > 0) return;
      watched.delete(el);
      observer?.unobserve(el);
    };
  };
  return {
    observeSize,
    /** 見張りをすべてやめる（テストの後片付け） */
    clear: () => {
      observer?.disconnect();
      observer = null;
      watched.clear();
    },
  };
}

const shared = createSizeObservers();

/** 画面全体で 1 つの ResizeObserver で、el の大きさが変わったら listener を呼ぶ（付けた直後にも 1 回）。返す関数でやめる */
export const observeSize = shared.observeSize;

/**
 * 要素の大きさが変わったら listener を呼ぶ（共有の ResizeObserver。observeSize）。返すのは要素に付けるコールバックの ref
 * （要素が替わったら見張り直す）。listener は描くたびに替わってよい（いつも最新のものを呼ぶ）
 */
export function useSizeObserver<E extends Element>(listener: SizeListener): (el: E | null) => (() => void) | undefined {
  const latest = useRef(listener);
  useLayoutEffect(() => {
    latest.current = listener;
  });
  return useCallback((el: E | null) => (el ? observeSize(el, (size, target) => latest.current(size, target)) : undefined), []);
}
