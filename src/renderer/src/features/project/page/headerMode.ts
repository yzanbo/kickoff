import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { PROJECT_HEADER_MODE } from "@/lib/storageKeys";
import { FOOTER_MODE_LABELS } from "@/features/footer/footerMode";

/**
 * プロジェクトの画面の見出しの行（名前・設定・状態ごとの数・一覧のボタン）の出し方。下の帯（フッター）と同じ 3 つ（利用者の依頼）。
 * show = 表示 / hover = マウスを画面の上端に寄せたときだけ、画面の上に重ねて出す（ふだんは縦の幅を取らない）/ hide = 非表示。
 * 表示のとき以外は、右上のレイアウトの開閉（LayoutToggles）も見出しと一緒に出し入れする（非表示なら出さない）
 */
export type ProjectHeaderMode = SettingValue<typeof PROJECT_HEADER_MODE>;
export const PROJECT_HEADER_MODES = PROJECT_HEADER_MODE.choices;

/** 出し方の名前（下の帯と同じ。設定の「表示」と、見出しの右クリックのメニューで共通） */
export const PROJECT_HEADER_MODE_LABELS: Record<ProjectHeaderMode, string> = FOOTER_MODE_LABELS;

/** プロジェクトの画面の見出しの行の出し方（どのプロジェクトでも同じ） */
export function useProjectHeaderMode() {
  return useSetting(PROJECT_HEADER_MODE);
}
