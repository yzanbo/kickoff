import { isDarkTheme } from "@shared/foundation/theme/backgrounds";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { readSetting, subscribeSetting, type SettingValue } from "@/foundation/ui/storage";
import { storage as shellStorage } from "@/foundation/ui/storage/storage";

export type Theme = SettingValue<typeof shellStorage.settings.theme>;

const darkScheme = () => matchMedia("(prefers-color-scheme: dark)");

/**
 * いまのテーマを <html data-theme> に出す（既定はダーク。system は OS のダーク・ライトに合わせる）。起動直後は public/boot.js が
 * 同じ値で先に出している。デスクトップアプリなら、選んでいるテーマをメインにも知らせる（窓の地の色）
 */
function applyTheme() {
  const theme = readSetting(shellStorage.settings.theme);
  document.documentElement.dataset.theme = isDarkTheme(theme, darkScheme().matches) ? "dark" : "light";
  window.kickoff?.appearance.setTheme(theme);
}

/**
 * 起動したときに 1 回: 覚えているテーマを出し、選び直したとき・OS のダーク・ライトが切り替わったとき（システムに合わせるなら）に出し直す。
 * いま出ているテーマを読むのは lib/appliedTheme.ts と hooks/useAppliedTheme.ts
 */
export function startTheme() {
  applyTheme();
  subscribeSetting(shellStorage.settings.theme, applyTheme);
  darkScheme().addEventListener("change", applyTheme);
}

/** 設定の「表示」のテーマ（選んだら、すぐ画面に出る） */
export const useTheme = () => useSetting(shellStorage.settings.theme);
