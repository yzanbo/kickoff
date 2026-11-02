import type { PanelTab } from "./useSidePanel";

/**
 * タブを閉じたあとに表示するタブ。閉じたのが表示中のタブなら、同じ位置に来たタブ（最後なら 1 つ前）。
 * ほかのタブを閉じたなら表示中のまま。タブがなくなれば null
 */
export function nextActiveTab(tabs: readonly Pick<PanelTab, "key">[], closedKey: string, activeTab: string | null): string | null {
  if (activeTab !== closedKey) return activeTab;
  const index = tabs.findIndex((t) => t.key === closedKey);
  const rest = tabs.filter((t) => t.key !== closedKey);
  return rest[Math.min(index, rest.length - 1)]?.key ?? null;
}

/** いくつかのタブを順に閉じたあとの、残るタブと表示するタブ（1 つずつ閉じたのと同じ結果になる） */
export function closeTabs<T extends Pick<PanelTab, "key">>(
  tabs: readonly T[],
  keys: readonly string[],
  activeTab: string | null,
): { tabs: T[]; activeTab: string | null } {
  return keys.reduce(
    (state, key) => ({ tabs: state.tabs.filter((t) => t.key !== key), activeTab: nextActiveTab(state.tabs, key, state.activeTab) }),
    { tabs: [...tabs], activeTab },
  );
}
