import { useSyncExternalStore } from "react";
import { useRoute } from "@/foundation/ui/navigation/router";
import { panelStateOf } from "@/features/panel/ui";
import { chatSidePanel } from "@/features/chat/ui";
import { followedPanels, subscribeFollowedPanels, visibleChildIds } from "./panelFollow";

const NONE: ReadonlySet<number> = new Set();

/**
 * いま開いているチャットの画面の右の欄で、見えている子チャットのタブ（孫・ひ孫も同じ欄に並ぶ）。
 * サイドバーの子チャットの行を、いちばん上のチャットの行と同じ「開いている」見た目にするのに使う（右の欄を閉じていれば空。分けたペインなら、それぞれの表のタブ）。
 * サイドバーの別ウィンドウでは、メインのウィンドウからの写しを読む
 */
export function useVisibleChildChats(): ReadonlySet<number> {
  const route = useRoute();
  const chatId = route.name === "chat" ? route.chatId : null;
  // チャットを開いていなければ読まない（ない欄の状態を作らない）。並びは文字にして比べ、変わったときだけ作り直す
  const ids = useSyncExternalStore(subscribeFollowedPanels, () => {
    if (chatId === null) return "";
    const followed = followedPanels();
    return (followed ? (followed.children[chatId] ?? []) : visibleChildIds(panelStateOf(chatSidePanel(chatId)))).join(",");
  });
  return ids === "" ? NONE : new Set(ids.split(",").map(Number));
}
