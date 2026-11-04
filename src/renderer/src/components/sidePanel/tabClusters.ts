import { PROJECT_HUES } from "../../../../core/projectColors";

/** 右のパネルのタブの列のまとめ方（none = まとめない / group = グループ別 / worktree = 作業場所別） */
export type TabGrouping = "none" | "group" | "worktree";
export const TAB_GROUPINGS: readonly TabGrouping[] = ["none", "group", "worktree"];
export const TAB_GROUPING_LABELS: Record<TabGrouping, string> = { none: "まとめない", group: "グループ別", worktree: "作業場所別" };

/** タブが入るまとまり（key が同じタブを 1 つにまとめる。label はまとまりの頭に出す名前、title はマウスを乗せたときの説明） */
export interface ClusterOf {
  key: string;
  label: string;
  title?: string;
  /** まとまりのプロジェクト（札の右クリックで、そのプロジェクトにグループを作る。「その他」にはない） */
  projectId?: number;
  /** グループ別のまとまりのグループ（null = グループなし。作業場所別では持たない） */
  groupId?: number | null;
  /** そのグループの名前（プロジェクト名を添えない、削除の確かめに出す名前） */
  groupName?: string;
}

/** ブラウザなど、どのグループ・作業場所にも入らないタブのまとまり（いちばん後ろに置く） */
export const OTHER_CLUSTER: ClusterOf = { key: "other", label: "その他", title: "グループ・作業場所に入らないタブ（ブラウザなど）" };

export interface TabCluster extends ClusterOf {
  /** まとまりの中のタブのキー（ペインの並びのまま） */
  tabs: string[];
}

/**
 * 並びを決めておくまとまり（サイドバーと同じ並び: 固定 → グループ → グループなし → アーカイブ済み）。keepEmpty ならタブがなくても札だけ出す。
 * tail なら、ほかのまとまりのあと（「その他」の前）に置く（アーカイブ済み）
 */
export interface ClusterSeed {
  cluster: ClusterOf;
  keepEmpty: boolean;
  tail?: boolean;
}

/**
 * ペインのタブ（並び順のキー）を、まとまりごとに分ける。order のまとまりを先にその順で並べ（keepEmpty ならタブがなくても出す）、
 * order にないまとまりは、そのまとまりのタブが初めて出てくる順に続け、order の tail のまとまり、「その他」の順に後ろへ置く。
 * まとまりの中はペインの並びのまま（並べ替えても、まとまりの中の順が変わるだけ）
 */
export function clusterTabs(keys: readonly string[], clusterOf: (key: string) => ClusterOf, order: readonly ClusterSeed[] = []): TabCluster[] {
  const clusters = new Map<string, TabCluster>();
  for (const { cluster } of order.filter((o) => !o.tail)) clusters.set(cluster.key, { ...cluster, tabs: [] });
  const tails = new Map(order.filter((o) => o.tail).map((o) => [o.cluster.key, { ...o.cluster, tabs: [] as string[] }]));
  for (const key of keys) {
    const c = clusterOf(key);
    const found = clusters.get(c.key) ?? tails.get(c.key);
    if (found) found.tabs.push(key);
    else clusters.set(c.key, { ...c, tabs: [key] });
  }
  const keep = new Set(order.filter((o) => o.keepEmpty).map((o) => o.cluster.key));
  const list = [...clusters.values(), ...tails.values()].filter((c) => c.tabs.length > 0 || keep.has(c.key));
  return [...list.filter((c) => c.key !== OTHER_CLUSTER.key), ...list.filter((c) => c.key === OTHER_CLUSTER.key)];
}

/**
 * 畳んだまとまりで見せるタブ。畳んでいれば、そのペインで表示中のタブ（中身が見えているもの）だけを残し、ほかは隠す
 * （表示中のタブまで隠すと、いま見ている中身がどのタブか分からなくなるため。隠したタブを一覧から開けば、そのタブが表示中になって出る）
 */
export function visibleClusterTabs(cluster: TabCluster, collapsed: boolean, active: string | null): string[] {
  return collapsed ? cluster.tabs.filter((key) => key === active) : cluster.tabs;
}

/**
 * 見た目の並びでの落とす位置（何番目のタブの前か）を、ペインの並びの位置に直す（まとめて並べ替えて見せているとき、
 * ドラッグで落とす位置は見た目の並びで決まるため）。いちばん後ろはペインの最後
 */
export function paneIndexOf(displayIndex: number, display: readonly string[], paneTabs: readonly string[]): number {
  const key = display[displayIndex];
  return key === undefined ? paneTabs.length : paneTabs.indexOf(key);
}

/**
 * まとまりの色（色相）。同じまとまりはいつも同じ色になるよう、キーから決める（並びが変わっても色は変わらない。プロジェクトの色と同じ 10 色から）。
 * 「その他」は色を付けない（null）
 */
export function clusterHue(key: string): number | null {
  if (key === OTHER_CLUSTER.key) return null;
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_HUES[hash % PROJECT_HUES.length];
}

/** 初めは畳んでおくまとまり（アーカイブ済み。サイドバーの「アーカイブ済み」も初めは閉じている） */
const foldedByDefault = (key: string) => key.endsWith(":archived");

/**
 * まとまりを畳んでいるか。stored は kickoff:panel-tab-clusters-collapsed の値（畳んだまとまりのキー）。
 * 初めは畳んでおくまとまりだけは逆に、開いたときに `open:<キー>` を覚える（覚えていなければ畳む）
 */
export function isClusterCollapsed(key: string, stored: readonly string[]): boolean {
  return foldedByDefault(key) ? !stored.includes(`open:${key}`) : stored.includes(key);
}

/** まとまりを畳む ⇄ 開くに切り替えたあとの stored */
export function toggleClusterCollapsed(key: string, stored: readonly string[]): string[] {
  const mark = foldedByDefault(key) ? `open:${key}` : key;
  return stored.includes(mark) ? stored.filter((k) => k !== mark) : [...stored, mark];
}
