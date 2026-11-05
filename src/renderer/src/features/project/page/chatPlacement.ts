import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { CHAT_PLACEMENT } from "@/lib/storageKeys";

/** プロジェクトのチャットを開く場所（separate = ボードと分けた「チャット」タブ / together = ボードの右のパネル） */
export type ChatPlacement = SettingValue<typeof CHAT_PLACEMENT>;

/** 置き方の名前（設定の「表示」） */
export const CHAT_PLACEMENT_LABELS: Record<ChatPlacement, string> = { separate: "チャットタブで開く（ボードと分ける）", together: "ボードの右で開く" };

/** チャットを開く場所（設定の「表示」で選ぶ。どのプロジェクトでも同じ。初めはボードと分ける） */
export function useChatPlacement() {
  return useSetting(CHAT_PLACEMENT);
}
