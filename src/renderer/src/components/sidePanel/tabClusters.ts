/** 右のパネルのタブの列のまとめ方（none = まとめない / group = グループ別 / worktree = 作業場所別） */
export type TabGrouping = "none" | "group" | "worktree";
export const TAB_GROUPINGS: readonly TabGrouping[] = ["none", "group", "worktree"];
export const TAB_GROUPING_LABELS: Record<TabGrouping, string> = { none: "まとめない", group: "グループ別", worktree: "作業場所別" };

/** タブが入るまとまり（key が同じタブを 1 つにまとめる。label はまとまりの頭に出す名前、title はマウスを乗せたときの説明） */
export interface ClusterOf {
  key: string;
  label: string;
  title?: string;
}

/** ブラウザなど、どのグループ・作業場所にも入らないタブのまとまり（いちばん後ろに置く） */
export const OTHER_CLUSTER: ClusterOf = { key: "other", label: "その他", title: "グループ・作業場所に入らないタブ（ブラウザなど）" };

export interface TabCluster extends ClusterOf {
  /** まとまりの中のタブのキー（ペインの並びのまま） */
  tabs: string[];
}

/**
 * ペインのタブ（並び順のキー）を、まとまりごとに分ける。まとまりは、そのまとまりのタブが初めて出てくる順に並べ、
 * 「その他」はいちばん後ろ。まとまりの中はペインの並びのまま（並べ替えても、まとまりの中の順が変わるだけ）
 */
export function clusterTabs(keys: readonly string[], clusterOf: (key: string) => ClusterOf): TabCluster[] {
  const clusters = new Map<string, TabCluster>();
  for (const key of keys) {
    const c = clusterOf(key);
    const found = clusters.get(c.key);
    if (found) found.tabs.push(key);
    else clusters.set(c.key, { ...c, tabs: [key] });
  }
  const list = [...clusters.values()];
  return [...list.filter((c) => c.key !== OTHER_CLUSTER.key), ...list.filter((c) => c.key === OTHER_CLUSTER.key)];
}

/**
 * 見た目の並びでの落とす位置（何番目のタブの前か）を、ペインの並びの位置に直す（まとめて並べ替えて見せているとき、
 * ドラッグで落とす位置は見た目の並びで決まるため）。いちばん後ろはペインの最後
 */
export function paneIndexOf(displayIndex: number, display: readonly string[], paneTabs: readonly string[]): number {
  const key = display[displayIndex];
  return key === undefined ? paneTabs.length : paneTabs.indexOf(key);
}
