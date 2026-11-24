import type { CSSProperties } from "react";
import { observeSize } from "@/foundation/ui/hooks/useSizeObserver";
import { inkOf, readRowLayout, skippedRow, type RowEls } from "./rowDom";
import { acceptRowSize, buildMetrics, type RowMetrics } from "./rowLayout";
import type { RowFrame } from "./rowWindowState";
import type { RowLayoutContext, RowWindowOptions } from "./rowWindowTypes";

/**
 * 行の窓（useRowWindow）の高さ: 並びのキー・行の要素を測る ref・見積もり・前からの和・描いた時点の --row-est。
 * 測った高さは呼ぶ側の店（sizes）に書き、描き直しはしない（前からの和を作り直す印だけ付ける）
 */
export function createRowHeights<T extends object>(optsOf: () => RowWindowOptions<T>) {
  let shape: { items: readonly T[]; keyOf: (item: T) => string; keys: string[]; indexOf: Map<string, number> } | null = null;
  // 行の要素（測っている間）と ref・描いた時点の --row-est・見積もりの覚え（項目ごと。幅・倍率が変わったら捨てる）
  const els = new Map<string, HTMLElement>();
  const refs = new Map<string, (el: HTMLElement | null) => () => void>();
  const est = new Map<string, number>();
  let estimates = new WeakMap<object, number>();
  let layout: RowLayoutContext = { width: 0, scale: 1 };
  let gap = 0;
  /** 前からの和を作り直すか（測った高さが変わった） */
  let dirty = true;
  let metricsOf: { items: readonly T[]; m: RowMetrics } | null = null;

  const shapeOf = () => {
    const opts = optsOf();
    if (!shape || shape.items !== opts.items || shape.keyOf !== opts.keyOf) {
      const keys = opts.items.map(opts.keyOf);
      shape = { items: opts.items, keyOf: opts.keyOf, keys, indexOf: new Map(keys.map((k, i) => [k, i])) };
    }
    return shape;
  };
  const heightOf = (item: T, key: string): number => {
    const measured = optsOf().sizes.peek(key);
    if (measured !== undefined) return measured;
    let e = estimates.get(item);
    if (e === undefined) {
      e = optsOf().estimate(item, layout);
      estimates.set(item, e);
    }
    return e;
  };
  // 前からの和（項目が変わった・測った高さが変わったときだけ作り直す）
  const metrics = (): RowMetrics => {
    const { items, keyOf } = optsOf();
    if (metricsOf && metricsOf.items === items && !dirty) return metricsOf.m;
    const hs = new Float64Array(items.length);
    for (let i = 0; i < items.length; i++) hs[i] = heightOf(items[i], keyOf(items[i]));
    const m = buildMetrics(hs, gap);
    metricsOf = { items, m };
    dirty = false;
    return m;
  };

  return {
    metrics,
    frame(): RowFrame {
      const { keys, indexOf } = shapeOf();
      return { keys, indexOf, m: metrics() };
    },
    rows: (): RowEls => ({ els, indexOf: shapeOf().indexOf }),
    /** 作り直す（チャットが替わった。行の要素・幅は残す） */
    reset() {
      est.clear();
      estimates = new WeakMap();
      dirty = true;
    },
    /** 並びを入れ替えた（描いた時点の --row-est を捨てる） */
    replaced: () => est.clear(),
    /** 本文の幅・文字の倍率・gap を読み、変わるたびに読み直して changed を呼ぶ（箱の高さが変わるため。片付けの関数を返す） */
    observeLayout(node: HTMLElement, changed: () => void): () => void {
      const read = () => {
        const { width, scale, gap: g } = readRowLayout(node);
        if (width === layout.width && scale === layout.scale && g === gap) return;
        layout = { width, scale };
        gap = g;
        estimates = new WeakMap();
        dirty = true;
        changed();
      };
      read();
      return observeSize(node, read);
    },
    measureRef(key: string) {
      let ref = refs.get(key);
      if (!ref) {
        ref = (el: HTMLElement | null) => {
          if (!el) return () => {};
          const { sizes } = optsOf();
          els.set(key, el);
          const ink = inkOf(el);
          // 何も描かない行（null を返す記録）は場所を取らない
          if (el.firstChild === null && sizes.peek(key) !== 0) {
            sizes.set(key, 0);
            dirty = true;
          }
          const off = observeSize(el, (size) => {
            const opts = optsOf();
            const height = Math.max(0, size.height - 2 * ink);
            const prev = opts.sizes.peek(key);
            if (!acceptRowSize({ skipped: skippedRow(el), prev, next: { width: size.width, height } })) return;
            opts.sizes.set(key, height);
            dirty = true;
            const i = shapeOf().indexOf.get(key);
            const item = i === undefined ? undefined : opts.items[i];
            if (item && prev === undefined) opts.onMeasured?.(item, height, layout);
          });
          return () => {
            off();
            if (els.get(key) === el) els.delete(key);
            est.delete(key);
          };
        };
        refs.set(key, ref);
      }
      return ref;
    },
    rowStyle(key: string): CSSProperties {
      let e = est.get(key);
      if (e === undefined) {
        const i = shapeOf().indexOf.get(key);
        e = i === undefined ? 120 : Math.round(heightOf(optsOf().items[i], key));
        est.set(key, e);
      }
      return { "--row-est": `${Math.max(1, e)}px` } as CSSProperties;
    },
  };
}
