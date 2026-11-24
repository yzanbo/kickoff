import type { StripProps } from "./surface";

/** 既定のタブの並べ方: ペインの並びのまま並べる（まとめない欄。チャットのパネルの並べ方は欄の Strip が差し替える） */
export function PlainStrip({ pane, renderTab, bar }: StripProps) {
  return bar(pane.tabs.map((key, i) => renderTab(key, i, pane.tabs.length)));
}
