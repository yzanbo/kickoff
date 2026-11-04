import { useSyncExternalStore } from "react";
import { readAppliedTheme, subscribeAppliedTheme, type AppliedTheme } from "@/lib/appliedTheme";

/** いま画面に出ているテーマ。<html data-theme> が変わると描き直す（図・コードの色・アイコンの配色を合わせるときなど） */
export function useAppliedTheme(): AppliedTheme {
  return useSyncExternalStore(subscribeAppliedTheme, readAppliedTheme);
}
