import { useMemo } from "react";
import type { VisualThemeValues } from "@shared/chat/visualDocument";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";

/** 図の中のテーマの変数を、画面の CSS の変数から読む（どの変数を読むかは tokens.css の末尾の一覧にも書く） */
function readVisualTheme(): VisualThemeValues {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    "--vis-bg": v("--bg"),
    "--vis-surface": v("--bg-elev"),
    "--vis-text": v("--text"),
    "--vis-muted": v("--muted"),
    "--vis-border": v("--border-strong"),
    "--vis-accent": v("--accent-fg"),
    "--vis-accent-text": v("--accent-text"),
    "--vis-danger": v("--ng"),
    "--vis-chart-1": v("--info"),
    "--vis-chart-2": v("--accent-fg"),
    "--vis-chart-3": v("--warn"),
    "--vis-chart-4": v("--child-depth-2"),
    "--vis-chart-5": v("--ng"),
    "--vis-chart-6": v("--child-depth-3"),
    "--vis-font": getComputedStyle(document.body).fontFamily,
    "--vis-mono": v("--mono"),
    "--vis-radius": v("--radius"),
  };
}

/** いまのテーマの図の変数（テーマを変えたら読み直す） */
export function useVisualTheme(): VisualThemeValues {
  const theme = useAppliedTheme();
  // テーマが変わった後の CSS の値を読む（theme は読み直すきっかけ）
  return useMemo(() => readVisualTheme(), [theme]);
}
