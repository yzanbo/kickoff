import { useMemo, useSyncExternalStore } from "react";
import { useRoute } from "@/app/router";
import { leavesOf } from "@/features/panel/layout/paneTree";
import { panelStateOf, subscribePanels } from "@/features/panel/state/panelStore";
import { panelKey } from "@/features/panel/surfaces";

const NONE: ReadonlySet<number> = new Set();

/**
 * いま開いているチャットの画面の右の欄で、見えている子チャットのタブ（孫・ひ孫も同じ欄に並ぶ）。
 * サイドバーの子チャットの行を、いちばん上のチャットの行と同じ「開いている」見た目にするのに使う（右の欄を閉じていれば空。分けたペインなら、それぞれの表のタブ）
 */
export function useShownChildChats(): ReadonlySet<number> {
  const route = useRoute();
  const chatId = route.name === "chat" ? route.chatId : null;
  // チャットを開いていなければ読まない（ない欄の状態を作らない）
  const state = useSyncExternalStore(subscribePanels, () => (chatId === null ? null : panelStateOf(panelKey("agents", chatId))));
  return useMemo(() => {
    if (!state?.open) return NONE;
    const shown = new Set(leavesOf(state.layout.root).map((p) => p.active));
    const ids = state.tabs.flatMap((t) => (t.kind === "child" && shown.has(t.key) ? [t.childId] : []));
    return ids.length > 0 ? new Set(ids) : NONE;
  }, [state]);
}
