import type { ReactNode } from "react";
import type { Route } from "@/app/router";

/** ⌘K の 1 行（押すと route へ移る） */
export interface PaletteItem {
  key: string;
  label: ReactNode;
  /** 絞り込みに使う文 */
  text: string;
  hint: string;
  /** 右の薄い文の前に置く印（プロジェクトの印） */
  hintMark?: ReactNode;
  /** 名前のすぐ後ろに並べる札（チャットのグループと作業場所） */
  chips?: ReactNode;
  icon: ReactNode;
  route: Route;
}
