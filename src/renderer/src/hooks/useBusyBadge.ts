import { useEffect, useState } from "react";

/**
 * 取り直しの最中の印を出すか（VS Code のバッジの更新中の印と同じ考え方）。busy になったらすぐ出し、
 * すぐ終わる取り直し（数 ms）でも見えるよう、出してから少なくとも minMs は出しておく
 */
export function useBusyBadge(busy: boolean, minMs = 500): boolean {
  // 出し始めた時刻（出していなければ null）
  const [shownAt, setShownAt] = useState<number | null>(null);
  // 描いている途中で立てる（effect を待つと、すぐ終わる取り直しでは一度も描かれない）
  if (busy && shownAt === null) setShownAt(Date.now());
  useEffect(() => {
    if (busy || shownAt === null) return;
    const timer = setTimeout(() => setShownAt(null), Math.max(0, shownAt + minMs - Date.now()));
    return () => clearTimeout(timer);
  }, [busy, shownAt, minMs]);
  return busy || shownAt !== null;
}
