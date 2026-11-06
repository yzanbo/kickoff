import type { ReactNode } from "react";
import type { Route } from "@/app/router";

/** ⌘K の 1 行（押すと route へ移る） */
export interface PaletteItem {
  key: string;
  label: ReactNode;
  /** 絞り込みに使う文 */
  text: string;
  hint: string;
  icon: ReactNode;
  route: Route;
}
