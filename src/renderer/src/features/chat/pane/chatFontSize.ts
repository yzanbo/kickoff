import { useEffect } from "react";
import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { CHAT_FONT_SIZE } from "@/lib/storageKeys";

/**
 * 会話の文字の大きさ（5 段階）。会話に出るもの（発言・返答・ツール・カード・動き）の文字だけを変え、見出し・入力欄・ピル・メニューは変えない。
 * 倍率は <html> の CSS 変数 --chat-font-scale にし、会話の入れ物が --chat-scale として使う（chat.css）
 */
export type ChatFontSize = SettingValue<typeof CHAT_FONT_SIZE>;
export const CHAT_FONT_SIZES = CHAT_FONT_SIZE.choices;

/** 名前（見出しの行のボタンのメニュー・タブの列の「表示」・設定の「表示」で共通） */
export const CHAT_FONT_SIZE_LABELS: Record<ChatFontSize, string> = { xs: "極小", sm: "小", md: "標準", lg: "大", xl: "特大" };

/** 標準を 1 とした倍率（本文の大きさがおよそ 12 / 13 / 14 / 16 / 18px になる。大きい側は読み疲れたとき用に広めに取る） */
const SCALES: Record<ChatFontSize, number> = { xs: 12 / 14, sm: 13 / 14, md: 1, lg: 16 / 14, xl: 18 / 14 };

/** 会話の文字の大きさ（どのチャットでも同じ） */
export function useChatFontSize() {
  return useSetting(CHAT_FONT_SIZE);
}

/** 会話の文字の大きさを画面に当てる（App が 1 回だけ呼ぶ） */
export function useApplyChatFontSize() {
  const [size] = useChatFontSize();
  useEffect(() => {
    document.documentElement.style.setProperty("--chat-font-scale", String(SCALES[size]));
  }, [size]);
}
