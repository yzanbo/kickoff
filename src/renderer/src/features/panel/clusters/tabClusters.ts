import { PROJECT_HUES, pickProjectHue } from "@shared/project/colors";
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
 * まとまりの好みの色（色相）。自分で作ったグループは覚えた色（ChatGroup.hue。作ったときに同じプロジェクトのほかのグループと被らない色を選んである）、
 * 作業場所はブランチの印と同じ色（hue。workplaceHue。同じプロジェクトのいまある作業場所どうしは被らない）、
 * ほか（固定・グループなし・アーカイブ済み）はキーから決める（並びが変わっても同じ色。プロジェクトの色と同じ 10 色から）。
 * 「その他」は色を付けない（null）
 */
export function clusterHue(cluster: Pick<BucketHead, "key" | "kind" | "group" | "hue">): number | null {
  if (cluster.kind === "other") return null;
  if (cluster.group) return cluster.group.hue;
  if (cluster.hue !== undefined) return cluster.hue;
  let hash = 0;
  for (const ch of cluster.key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_HUES[hash % PROJECT_HUES.length];
}

/**
 * タブの列に並ぶまとまりの色を、互いに被らないように決める（プロジェクトの色と同じ 10 色から）。決まった色のあるまとまり（グループ・作業場所）を先に、
 * 並びの順にそれぞれの好みの色（clusterHue）を取り、もう使われていれば、まだ使われていない色からプロジェクトと同じ選び方で選ぶ
 * （10 色を使い切ったら被ってもよい）。以前はキーから決めるだけで、同じ列のまとまりの色が被っていた
 */
export function clusterHues(clusters: readonly Pick<BucketHead, "key" | "kind" | "group" | "hue">[]): Map<string, number | null> {
  const hues = new Map<string, number | null>();
  const used: number[] = [];
  const fixed = (c: Pick<BucketHead, "group" | "hue">) => c.group !== undefined || c.hue !== undefined;
  const fixedFirst = [...clusters.filter(fixed), ...clusters.filter((c) => !fixed(c))];
  for (const c of fixedFirst) {
    const wanted = clusterHue(c);
    if (wanted === null) {
      hues.set(c.key, null);
      continue;
    }
    const hue = used.includes(wanted) && used.length < PROJECT_HUES.length ? pickProjectHue(used) : wanted;
    used.push(hue);
    hues.set(c.key, hue);
  }
  return hues;
}
