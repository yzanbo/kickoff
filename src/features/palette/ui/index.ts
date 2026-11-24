// palette の画面の口（ほかの機能から読むもの）
import { openAppDialog } from "@/foundation/ui/shell/points";
import { storage } from "./storage";

export { paletteSources, type PaletteNamedSource, type PaletteTextSource } from "./sources";
export type { PaletteItem } from "./paletteItem";

declare module "@/foundation/ui/shell/points" {
  interface AppDialogMap {
    /** コマンドパレット（⌘K） */
    commandPalette: null;
    /** チャットの中の文言の全文検索のパネル */
    contentSearch: null;
  }
}

/** チャットの中の文言の全文検索のパネルを開く（App が受け取る。ボードの検索欄の横のボタン） */
export const openContentSearch = (): void => openAppDialog("contentSearch");

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const paletteSettings = {
  activeShowArchivedProjects: storage.settings.activeShowArchivedProjects,
  activeHiddenStates: storage.settings.activeHiddenStates,
} as const;
