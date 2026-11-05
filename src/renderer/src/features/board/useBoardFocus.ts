import { useEffect, useRef } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { navigate, REOPEN_EVENT, type ReopenRoute } from "@/app/router";

/**
 * サイドバー・検索などから開いたチャット・新しいチャット（URL）を、プロジェクトのボードの右側のパネルで開く。
 * URL が変わらない開き直し（閉じたパネルで同じチャットを押したときなど）も、イベントで受け取って開く。
 * 新しいチャットは開いたら URL からボード（tab。開いたボード）に戻す（新しいチャットは押すたびに増えるので、ボードを開き直したときにもう 1 つ開かないように）
 */
export function useBoardFocus(focus: ReopenRoute | undefined, open: (target: ReopenRoute) => void, tab: "board" | "groups") {
  const openRef = useRef(open);
  openRef.current = open;
  const focusKey = focus ? JSON.stringify(focus) : "";

  useEffect(() => {
    if (!focus) return;
    openRef.current(focus);
    if (focus.name === "newChat") {
      navigate({ name: "project", id: focus.projectId, tab }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  useWindowEvent(REOPEN_EVENT, (e) => open((e as CustomEvent<ReopenRoute>).detail));
}
