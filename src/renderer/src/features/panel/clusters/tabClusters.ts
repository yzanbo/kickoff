import { sortBuckets, type BucketHead } from "@/features/chatList/buckets";

/** ブラウザなど、どのグループ・作業場所にも入らないタブのまとまり（いちばん後ろに置く） */
export const OTHER_CLUSTER: BucketHead = { key: "other", kind: "other", label: "その他", title: "グループ・作業場所に入らないタブ（ブラウザなど）" };

/** タブのまとまり（見出しは bucketChats と同じ形・同じキー。サイドバーの見出し・ボードの段と同じまとまり） */
export interface TabCluster extends BucketHead {
  /** まとまりの中のタブのキー（ペインの並びのまま） */
  tabs: string[];
}

/**
 * ペインのタブ（並び順のキー）を、まとまりごとに分ける。並びは bucketChats と同じ（sortBuckets: プロジェクトの順 projectOrder → その中は
 * 固定 → グループ（サイドバーの並び）・作業場所（本体が先）→ グループなし、後ろにアーカイブ済み → 「その他」）。
 * seeds はタブがなくても札だけ出すまとまり（グループ別のときの、自分で作ったグループ）。まとまりの中はペインの並びのまま
 * （並べ替えても、まとまりの中の順が変わるだけ）
 */
export function clusterTabs(keys: readonly string[], clusterOf: (key: string) => BucketHead, seeds: readonly BucketHead[] = [], projectOrder: readonly number[] = []): TabCluster[] {
  const clusters = new Map<string, TabCluster>();
  for (const head of seeds) clusters.set(head.key, { ...head, tabs: [] });
  for (const key of keys) {
    const head = clusterOf(key);
    const found = clusters.get(head.key);
    if (found) found.tabs.push(key);
    else clusters.set(head.key, { ...head, tabs: [key] });
  }
  return sortBuckets([...clusters.values()], projectOrder);
}

/**
 * タブの列に出すまとまり（グループ別のとき）: 隠したグループ（hiddenGroups。自分で作ったグループだけ）と、hideEmpty なら
 * チャットもタブもないグループ（countOf が 0）を外す。隠したグループでも、ペインで表示中のタブ（active）があれば、
 * そのタブがどれか分かるよう札ごと残し、畳んだ形で見せる（forced。そのタブだけが見える）。グループなし・固定・アーカイブ済み・作業場所・その他は外さない
 */
export function shownClusters(
  clusters: readonly TabCluster[],
  { hiddenGroups, hideEmpty, countOf, active }: { hiddenGroups: ReadonlySet<number>; hideEmpty: boolean; countOf: (cluster: TabCluster) => number; active: string | null },
): { clusters: TabCluster[]; forced: Set<string> } {
  const forced = new Set<string>();
  const shown = clusters.filter((c) => {
    if (c.kind !== "group" || !c.group) return true;
    if (hiddenGroups.has(c.group.id)) {
      if (active === null || !c.tabs.includes(active)) return false;
      forced.add(c.key);
      return true;
    }
    return !(hideEmpty && c.tabs.length === 0 && countOf(c) === 0);
  });
  return { clusters: shown, forced };
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
 * 一覧のペインのタブを、チャットのタブだけサイドバーの並び（orderOf。チャットの ID → 何番目か）に並べ替える（利用者の依頼で、サイドバーとタブの並びをそろえる）。
 * チャットのタブは、いまチャットのタブがある位置どうしで入れ替え、ほかのタブ（新しいチャット・ブラウザなど）は位置を変えない。
 * サイドバーの並びにないチャット（自分で開いたアーカイブ済みなど）は、並びにあるものの後ろに今の順のまま。変わらなければ同じ配列を返す
 */
export function orderLikeSidebar(keys: string[], chatIdOf: (key: string) => number | null, orderOf: ReadonlyMap<number, number>): string[] {
  const chatKeys = keys.filter((k) => chatIdOf(k) !== null);
  const rank = (k: string) => orderOf.get(chatIdOf(k) as number) ?? Number.MAX_SAFE_INTEGER;
  // 同じ順位（並びにないもの）どうしは今の順のまま（sort は安定）
  const sorted = [...chatKeys].sort((a, b) => rank(a) - rank(b));
  if (sorted.every((k, i) => k === chatKeys[i])) return keys;
  let next = 0;
  return keys.map((k) => (chatIdOf(k) === null ? k : sorted[next++]));
}
