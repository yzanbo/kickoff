import { useId, type KeyboardEvent } from "react";
import { useRovingList, type RovingOrientation } from "@/foundation/ui/kit/list/useRovingList";

export interface TabsOptions<K extends string> {
  keys: readonly K[];
  /** 選んでいるタブ（なければ null） */
  value: K | null;
  onChange(key: K): void;
  /** 並ぶ向き（vertical は ↑↓・horizontal は ←→ で動く。既定 horizontal） */
  orientation?: RovingOrientation;
  /** タブの列の読み上げの名前 */
  label: string;
}

export interface Tabs<K extends string> {
  /** タブの列の入れ物に渡す */
  listProps: { role: "tablist"; "aria-label": string; "aria-orientation": RovingOrientation; onKeyDown(e: KeyboardEvent<HTMLElement>): void };
  /** タブ（押せる要素）に渡す */
  tabProps(key: K): { id: string; role: "tab"; "aria-selected": boolean; "aria-controls": string; onClick(): void };
  /** タブの中身の入れ物に渡す */
  panelProps(key: K): { id: string; role: "tabpanel"; "aria-labelledby": string; hidden: boolean };
}

/**
 * タブの列の役割とキー。矢印で隣のタブへピントを移して選ぶ（端では回り込む）。
 * Tab のキーはどのタブにも止まる（ほかの選ぶ組と同じ。動きを変えない）
 */
export function useTabs<K extends string>({ keys, value, onChange, orientation = "horizontal", label }: TabsOptions<K>): Tabs<K> {
  const baseId = useId();
  const tabId = (key: K) => `${baseId}-tab-${key}`;
  const panelId = (key: K) => `${baseId}-panel-${key}`;
  const nav = useRovingList({
    mode: "focus",
    orientation,
    // この列のタブだけ（中身の中に別のタブの列があっても数えない）
    items: (root) => keys.flatMap((key) => root.ownerDocument.getElementById(tabId(key)) ?? []),
    onMove: (item) => {
      const key = keys.find((k) => tabId(k) === item.id);
      if (key !== undefined && key !== value) onChange(key);
    },
  });
  return {
    listProps: { role: "tablist", "aria-label": label, "aria-orientation": orientation, onKeyDown: nav.onKeyDown },
    tabProps: (key) => ({ id: tabId(key), role: "tab", "aria-selected": key === value, "aria-controls": panelId(key), onClick: () => onChange(key) }),
    panelProps: (key) => ({ id: panelId(key), role: "tabpanel", "aria-labelledby": tabId(key), hidden: key !== value }),
  };
}
