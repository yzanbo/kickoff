// チャットの別ウィンドウにあるチャットを、メインのウィンドウのチャットのパネルに出し直さない（不具合の候補 11-2）。
// 別ウィンドウは開いたとき・メインのウィンドウが起動し直したとき（mainWindowReady）に自分のチャットのタブを知らせ、メインのウィンドウは表示だけ消したことにする
import { onWindowMessage, postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { allPanels, chatKey, closeTab, parsePanelKey, syncPanel } from "@/features/panel/ui";
import { chatsPanel } from "@/features/chat/ui";
import type { LinkInput } from "./linkedTabs";

/** 別ウィンドウにあるチャット（どのチャットのパネルの、どのチャットか） */
export interface HeldChat {
  panel: string;
  chatId: number;
}

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** チャットの別ウィンドウにあるチャットのタブ（メインのウィンドウはチャットのパネルに出し直さない。state/windowChats.ts） */
    chatWindowTabs: { chats: HeldChat[] };
  }
}

/** このウィンドウのチャットの別ウィンドウの欄（cwin）にあるチャットのタブ */
function windowChats(): HeldChat[] {
  return [...allPanels()].flatMap(([key, s]) =>
    parsePanelKey(key)?.surface === "cwin" ? s.tabs.flatMap((t) => (t.kind === "chat" ? [{ panel: chatsPanel(t.projectId), chatId: t.id }] : [])) : [],
  );
}

/** チャットの別ウィンドウ: いまのチャットのタブをメインのウィンドウに知らせ、メインのウィンドウが起動し直したら知らせ直す。やめるときは返り値を呼ぶ */
export function announceWindowChats(): () => void {
  const post = () => {
    const chats = windowChats();
    if (chats.length > 0) postWindowMessage("chatWindowTabs", { chats });
  };
  post();
  return onWindowMessage("mainWindowReady", post);
}

/** メインのウィンドウ: 別ウィンドウにあるチャットは、チャットのパネルにタブがあれば後始末なしで閉じ、連動で足し直さないよう表示だけ消したことにする */
export function holdChatsElsewhere(chats: readonly HeldChat[]): void {
  for (const { panel, chatId } of chats) {
    const key = chatKey(chatId);
    if (allPanels().get(panel)?.tabs.some((t) => t.key === key)) closeTab(panel, key, { dismiss: true, keep: true });
    syncPanel(panel, { held: [chatId] } satisfies LinkInput);
  }
}
