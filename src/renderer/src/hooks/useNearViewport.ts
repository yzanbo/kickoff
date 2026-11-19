import { useCallback, useState } from "react";

/**
 * 要素が画面（スクロールする枠の見えている所）の手前まで来たかを見張る、共有の IntersectionObserver。
 * 見張りは「枠（root）と余白（margin）の組」ごとに 1 つを使い回す（要素ごとに new IntersectionObserver しない）。
 * 枠は、要素のいちばん外側の data-near-root の先祖（チャットの流れの枠など）。なければ画面。
 * root を省く（画面を枠にする）と、rootMargin が広げるのは画面の見える所だけで、途中のスクロールする枠の切り取りには余白が付かず、
 * 枠の外の要素は手前まで来ても「見えていない」のままになるため、流れの枠を root にする。その中の入れ子のスクロールする枠（カードの窓）の
 * 切り取りには scrollMargin に同じ余白を入れて広げる
 */
export interface ViewportWatchers {
  /** el が手前 margin px まで来た・離れたら onChange（見張り始めた直後にも 1 回）。返す関数で見張りをやめる */
  watch(el: Element, margin: number, onChange: (near: boolean) => void): () => void;
}

interface Watcher {
  observer: IntersectionObserver;
  listeners: Map<Element, (near: boolean) => void>;
}

/** 見張りの組を作る（画面はモジュールの 1 つを使う。テストは IntersectionObserver を vi.stubGlobal で置いてこれで作る） */
export function createViewportWatchers(): ViewportWatchers {
  // 枠（なければ null = 画面）→ 余白 → 見張り
  const byRoot = new Map<Element | null, Map<number, Watcher>>();
  const rootOf = (el: Element): Element | null => {
    let root: Element | null = null;
    for (let at = el.parentElement?.closest("[data-near-root]") ?? null; at; at = at.parentElement?.closest("[data-near-root]") ?? null) root = at;
    return root;
  };
  return {
    watch(el, margin, onChange) {
      const root = rootOf(el);
      let byMargin = byRoot.get(root);
      if (!byMargin) byRoot.set(root, (byMargin = new Map()));
      let watcher = byMargin.get(margin);
      if (!watcher) {
        const listeners = new Map<Element, (near: boolean) => void>();
        const options = { root, rootMargin: `${margin}px`, scrollMargin: `${margin}px` } as IntersectionObserverInit;
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
        }, options);
        watcher = { observer, listeners };
        byMargin.set(margin, watcher);
      }
      const w = watcher;
      w.listeners.set(el, onChange);
      w.observer.observe(el);
      return () => {
        if (w.listeners.get(el) !== onChange) return;
        w.listeners.delete(el);
        w.observer.unobserve(el);
        if (w.listeners.size === 0) {
          // 使う要素がなくなった見張りは捨てる（流れの枠を作り直したときに、古い枠の見張りを残さない）
          w.observer.disconnect();
          byMargin.delete(margin);
          if (byMargin.size === 0) byRoot.delete(root);
        }
      };
    },
  };
}

let shared: ViewportWatchers | undefined;

/** 画面で使う見張り（初めて使うときに作る） */
export function watchViewport(el: Element, margin: number, onChange: (near: boolean) => void): () => void {
  shared ??= createViewportWatchers();
  return shared.watch(el, margin, onChange);
}

/** 重いもの（Mermaid の図・AI が描いた図・コードの色付け）を描き始める距離（画面の手前） */
const NEAR_MARGIN_PX = 1200;

/**
 * 返した ref を付けた要素が、スクロールする枠の見えている所の手前 margin（既定 1200px）まで来たか。一度来たら true のまま
 * （描いた図を、画面から離れるたびに捨てない。行ごと外すのは流れの窓）。enabled が false の間は見張らない（false のまま）
 */
export function useNearViewport<E extends Element>({ margin = NEAR_MARGIN_PX, enabled = true }: { margin?: number; enabled?: boolean } = {}): [
  ref: (el: E | null) => (() => void) | undefined,
  near: boolean,
] {
  const [near, setNear] = useState(false);
  const watching = enabled && !near;
  const ref = useCallback(
    (el: E | null) => {
      if (!el || !watching) return undefined;
      let stop: (() => void) | null = null;
      stop = watchViewport(el, margin, (n) => {
        if (!n) return;
        setNear(true);
        stop?.();
        stop = null;
      });
      return () => stop?.();
    },
    [margin, watching],
  );
  return [ref, near];
}
