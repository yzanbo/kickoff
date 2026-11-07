// まとまりの色（色相）。サイドバーのまとまりの見出しと、パネルのタブのまとまりの札・タブの線で同じ色にする
import { PROJECT_HUES, pickProjectHue } from "@shared/project/colors";
import type { BucketContext, BucketHead } from "./buckets";
import { archivedKey, groupKey, pinnedKey, workplaceHead } from "./bucketHeads";

/** 色を付けるまとめ方（グループ別・作業場所別） */
export type HuedGrouping = "group" | "worktree";

/** 文字列から決まる好みの色（プロジェクトの色と同じ 10 色から。同じ文字列ならいつも同じ色） */
function hashHue(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_HUES[hash % PROJECT_HUES.length];
}

/** 好みの色を並びの順に取り、もう使われていれば、まだ使われていない色からプロジェクトと同じ選び方で選ぶ（10 色を使い切ったら被ってよい） */
export function spreadHues(wanted: readonly (readonly [key: string, hue: number])[]): Map<string, number> {
  const hues = new Map<string, number>();
  const used: number[] = [];
  for (const [key, want] of wanted) {
    const hue = used.includes(want) && used.length < PROJECT_HUES.length ? pickProjectHue(used) : want;
    used.push(hue);
    hues.set(key, hue);
  }
  return hues;
}

/**
 * 1 つのプロジェクトのまとまりの色（キー → 色相）。サイドバーとタブの列で同じ色になるよう、画面に出ているまとまりではなく、
 * そのプロジェクトのまとまりになりうるものすべてから決める（タブの列に出ているまとまり・隠したグループで色が変わらない）。
 * 決まった色のあるもの（グループ別 = 自分で作ったグループの覚えた色 ChatGroup.hue をグループの並びで、作業場所別 = いまある作業場所の
 * ブランチの印と同じ色 workplaceHue）を先に取り、そのあと固定 → グループなし → アーカイブ済みが、キーから決まる好みの色を取る（被れば空いている色へ）
 */
export function projectBucketHues(by: HuedGrouping, projectId: number, ctx: Pick<BucketContext, "groupsOf" | "worktreesOf">): Map<string, number> {
  const fixed: [string, number][] =
    by === "group"
      ? (ctx.groupsOf?.(projectId) ?? []).map((g) => [groupKey(projectId, g.id), g.hue])
      : [{ worktree_path: null, branch: null }, ...(ctx.worktreesOf?.(projectId) ?? []).filter((w) => !w.main && !w.prunable).map((w) => ({ worktree_path: w.path, branch: w.branch }))]
          .map((place) => workplaceHead(projectId, place, ctx))
          .map((head) => [head.key, head.hue ?? hashHue(head.key)]);
  const loose = by === "group" ? [pinnedKey(projectId), groupKey(projectId, null), archivedKey(projectId)] : [pinnedKey(projectId), archivedKey(projectId)];
  return spreadHues([...fixed, ...loose.map((key) => [key, hashHue(key)] as const)]);
}

/**
 * まとまりの色。hues（projectBucketHues）にあればその色、なければ（フォルダなし・以前のブランチ・アーカイブ済みの中の段）グループの色 →
 * 作業場所の色 → キーから決まる色。プロジェクト・状態・「その他」（ブラウザなど）・まとめないときは色を付けない（null）
 */
export function bucketHueOf(head: Pick<BucketHead, "key" | "kind" | "group" | "hue">, hues: ReadonlyMap<string, number>): number | null {
  if (head.kind === "other" || head.kind === "all" || head.kind === "status" || head.kind === "project") return null;
  return hues.get(head.key) ?? head.group?.hue ?? head.hue ?? hashHue(head.key);
}

/** いくつかのプロジェクトのまとまりの色をまとめて引く形（プロジェクトどうしは別々に決める） */
export function bucketHuesOf(by: HuedGrouping, projectIds: readonly number[], ctx: Pick<BucketContext, "groupsOf" | "worktreesOf">): Map<string, number> {
  return new Map(projectIds.flatMap((id) => [...projectBucketHues(by, id, ctx)]));
}
