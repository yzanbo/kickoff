import { useEffect, useEffectEvent } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { navigate, REOPEN_EVENT, type ReopenRoute } from "@/app/router";

/**
 * サイドバー・検索などから開いたチャット・新しいチャット（URL）を、プロジェクトのボードの右側のパネルで開く。
 * URL が変わらない開き直し（閉じたパネルで同じチャットを押したときなど）も、イベントで受け取って開く。
 * 新しいチャットは開いたら URL からボード（tab。開いたボード・チャットタブ）に戻す（新しいチャットは押すたびに増えるので、ボードを開き直したときにもう 1 つ開かないように）
 */
export function useBoardFocus(focus: ReopenRoute | undefined, open: (target: ReopenRoute) => void, tab: "board" | "chats") {
  // 開き直すのは行き先（focus の中身）が変わったときだけ（focus は描くたびに作られるので文字にして比べる）
  const focusKey = focus ? JSON.stringify(focus) : "";
  const openFocus = useEffectEvent(() => {
    if (!focus) return;
    open(focus);
    if (focus.name === "newChat") {
      navigate({ name: "project", id: focus.projectId, tab }, { replace: true });
    }
  });

  useEffect(() => {
    openFocus();
  }, [focusKey]);

  useWindowEvent(REOPEN_EVENT, (e) => open((e as CustomEvent<ReopenRoute>).detail));
}
