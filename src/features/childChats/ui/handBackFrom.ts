// 入力欄に入れた子チャットからの依頼の出どころ（親チャットの入力欄から送る発言に handoff_from で付け、送れたら消す。読むのは composer の送る口）
import type { HandoffFrom } from "@shared/chat/chatEvent";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";

/** チャットの出どころを読む・消す口（composer の useChatSend に渡す） */
export const handBackFromOf = (chatId: number): { read: () => HandoffFrom | null; clear: () => void } => ({
  read: () => readSetting(storage.settings.handBackFrom(chatId)),
  clear: () => writeSetting(storage.settings.handBackFrom(chatId), null),
});
