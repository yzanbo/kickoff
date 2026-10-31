import { useEffect, useState } from "react";

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
