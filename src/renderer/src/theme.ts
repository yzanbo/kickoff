import { useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "system";
const KEY = "kickoff:theme";

export function loadTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "system" ? v : "dark";
}

/** テーマ（既定はダーク）。<html data-theme> に反映する */
export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  useEffect(() => {
    localStorage.setItem(KEY, theme);
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
  return [theme, setTheme] as const;
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
