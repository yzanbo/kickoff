import { useSetting } from "@/foundation/ui/hooks/useSetting";
import type { ProjectViewId } from "@/foundation/ui/navigation/router";
import type { SettingValue } from "@/foundation/ui/storage";
import { CHAT_PLACEMENT } from "@/foundation/ui/storage/storageKeys";

/** プロジェクトのチャットを開く場所（separate = ボードと分けた「チャット」タブ / together = ボードの右のパネル） */
export type ChatPlacement = SettingValue<typeof CHAT_PLACEMENT>;

/** 置き方の名前（設定の「表示」） */
export const CHAT_PLACEMENT_LABELS: Record<ChatPlacement, string> = { separate: "チャットタブで開く（ボードと分ける）", together: "ボードの右で開く" };

/** チャット・新しいチャットの URL で出すプロジェクトのタブ。チャットをボードと分けている（separate）ときは「チャット」タブ、ほかはボード */
export function boardTabOf(placement: ChatPlacement): ProjectViewId {
  return placement === "separate" ? "chats" : "board";
}

/** チャットを開く場所（設定の「表示」で選ぶ。どのプロジェクトでも同じ。初めはボードと分ける） */
export function useChatPlacement() {
  return useSetting(CHAT_PLACEMENT);
}
