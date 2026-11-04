import { useState, useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/storageKeys";

export type Theme = "dark" | "light" | "system";

function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "system" ? v : "dark";
}

const darkScheme = () => matchMedia("(prefers-color-scheme: dark)");

/** テーマ（既定はダーク）。<html data-theme> に反映する（system は OS のダーク・ライトに合わせる） */
function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && darkScheme().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/**
 * 起動したときに 1 回: 覚えているテーマを出し、「システムに合わせる」なら OS のダーク・ライトの切り替えにも付いていく。
 * （以前は設定の「表示」を開いている間だけ OS の切り替えを見ていて、閉じると付いていかなかった）
 */
export function startTheme() {
  applyTheme(loadTheme());
  darkScheme().addEventListener("change", () => {
    if (loadTheme() === "system") applyTheme("system");
  });
}

/** 設定の「表示」のテーマ。選んだらすぐ画面に出して覚える */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const change = (next: Theme) => {
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
    applyTheme(next);
  };
  return [theme, change] as const;
}

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
