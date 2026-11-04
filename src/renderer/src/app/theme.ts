import { useSetting } from "@/hooks/useSetting";
import { readSetting, subscribeSetting, type SettingValue } from "@/lib/storage";
import { THEME } from "@/lib/storageKeys";

export type Theme = SettingValue<typeof THEME>;

const darkScheme = () => matchMedia("(prefers-color-scheme: dark)");

/** いまのテーマを <html data-theme> に出す（既定はダーク。system は OS のダーク・ライトに合わせる） */
function applyTheme() {
  const theme = readSetting(THEME);
  const dark = theme === "dark" || (theme === "system" && darkScheme().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/**
 * 起動したときに 1 回: 覚えているテーマを出し、選び直したとき・OS のダーク・ライトが切り替わったとき（システムに合わせるなら）に出し直す。
 * いま出ているテーマを読むのは lib/appliedTheme.ts と hooks/useAppliedTheme.ts
 */
export function startTheme() {
  applyTheme();
  subscribeSetting(THEME, applyTheme);
  darkScheme().addEventListener("change", applyTheme);
}

/** 設定の「表示」のテーマ（選んだら、すぐ画面に出る） */
export const useTheme = () => useSetting(THEME);
