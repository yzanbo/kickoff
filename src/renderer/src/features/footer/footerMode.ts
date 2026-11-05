import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { FOOTER_MODE } from "@/lib/storageKeys";

/**
 * 下の帯（フッター。設定・接続・ブランチ・使用状況）の出し方。
 * show = 表示 / hover = マウスを画面の下端に寄せたときだけ、画面の上に重ねて出す（ふだんは縦の幅を取らない）/ hide = 非表示（設定は ⌘, から）
 */
export type FooterMode = SettingValue<typeof FOOTER_MODE>;
export const FOOTER_MODES = FOOTER_MODE.choices;

/** 出し方の名前（設定の「表示」と、下の帯の右クリックのメニューで共通） */
export const FOOTER_MODE_LABELS: Record<FooterMode, string> = { show: "表示", hover: "寄せたときだけ表示", hide: "非表示" };

/** 下の帯の出し方（どの画面でも同じ） */
export function useFooterMode() {
  return useSetting(FOOTER_MODE);
}
