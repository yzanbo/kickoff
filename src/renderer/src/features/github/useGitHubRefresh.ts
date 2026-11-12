import { useEffect, useRef } from "react";
import { useWindowFocused } from "@/hooks/useWindowFocused";

/** 開いている間に GitHub から取り直す間隔（1 分） */
export const GITHUB_REFRESH_MS = 60_000;

/**
 * GitHub タブの取り直しの合図（要件 5.11: 開いている間だけ 1 分ごと・Kickoff の窓に戻ったとき）。
 * active でない（表示していない）間は何もしない。窓がほかのアプリの後ろにある間は、1 分ごとの取り直しもしない
 */
export function useGitHubRefresh(refresh: () => void, active: boolean) {
  const focused = useWindowFocused();
  const latest = useRef(refresh);
  latest.current = refresh;
  const wasFocused = useRef(focused);

  // 窓に戻ったら取り直す
  useEffect(() => {
    if (active && focused && !wasFocused.current) latest.current();
    wasFocused.current = focused;
  }, [focused, active]);

  // 開いている間だけ 1 分ごと
  useEffect(() => {
    if (!active || !focused) return;
    const timer = setInterval(() => latest.current(), GITHUB_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, focused]);
}
