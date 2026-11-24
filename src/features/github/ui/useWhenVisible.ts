// 要素が画面（スクロールする入れ物の中）に見えたら呼ぶ（一覧を下まで送ったら続きを読む）
import { useEffect, useEffectEvent, useState } from "react";
import { watchViewport } from "@/foundation/ui/hooks/useNearViewport";

/**
 * 返した ref を付けた要素が見えたら（margin だけ手前から）onVisible を呼ぶ。enabled が false の間は見ない。
 * again が変わったら見直す（読み足しても要素がまだ見えているとき、もう一度呼ぶため）。
 * 見張りは画面で共有する IntersectionObserver（`useNearViewport.ts` の `watchViewport`）
 */
export function useWhenVisible<T extends Element>(onVisible: () => void, enabled: boolean, again: unknown, margin = 200) {
  const [node, setNode] = useState<T | null>(null);
  const latest = useEffectEvent(onVisible);
  useEffect(() => {
    if (!node || !enabled) return;
    return watchViewport(node, margin, (visible) => visible && latest());
  }, [node, enabled, again, margin]);
  return setNode;
}
