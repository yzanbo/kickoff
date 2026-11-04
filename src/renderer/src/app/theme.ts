import { useSyncExternalStore } from "react";
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
 * 起動したときに 1 回: 覚えているテーマを出し、選び直したとき・OS のダーク・ライトが切り替わったとき（システムに合わせるなら）に出し直す
 * （以前は設定の「表示」を開いている間だけ OS の切り替えを見ていて、閉じると付いていかなかった）
 */
export function startTheme() {
  applyTheme();
  subscribeSetting(THEME, applyTheme);
  darkScheme().addEventListener("change", applyTheme);
}

/** 設定の「表示」のテーマ（選んだら、すぐ画面に出る） */
export const useTheme = () => useSetting(THEME);

/** いま画面に出ているテーマ（「システムに合わせる」も、ダーク・ライトのどちらかにしたもの） */
export type AppliedTheme = "dark" | "light";

const readAppliedTheme = (): AppliedTheme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

// 見ている部品がいくつあっても、<html> の見張りは 1 つにする（ファイルの一覧の行ごとに使うため）
const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | undefined;

function subscribeAppliedTheme(onChange: () => void) {
  themeListeners.add(onChange);
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => themeListeners.forEach((listener) => listener()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  return () => {
    themeListeners.delete(onChange);
    if (themeListeners.size === 0) {
      themeObserver?.disconnect();
      themeObserver = undefined;
    }
  };
}

/** いま画面に出ているテーマ。<html data-theme> が変わると描き直す（図の配色を合わせるときなど） */
export function useAppliedTheme(): AppliedTheme {
  return useSyncExternalStore(subscribeAppliedTheme, readAppliedTheme);
}
