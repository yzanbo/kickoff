import { useEffect, useRef } from "react";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { REOPEN_EVENT, type ReopenRoute } from "../../router";

/**
 * サイドバー・検索などから開いたチャット・新しいチャット（URL）を、ボードの右側のパネルで開く。
 * URL が変わらない開き直し（閉じたパネルで同じチャットを押したときなど）も、イベントで受け取って開く
 */
export function useBoardFocus(focus: ReopenRoute | undefined, open: (target: ReopenRoute) => void, enabled = true) {
  const openRef = useRef(open);
  openRef.current = open;
  const focusKey = focus ? JSON.stringify(focus) : "";

  useEffect(() => {
    if (enabled && focus) openRef.current(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, enabled]);

  useWindowEvent(REOPEN_EVENT, (e) => open((e as CustomEvent<ReopenRoute>).detail), enabled);
}
