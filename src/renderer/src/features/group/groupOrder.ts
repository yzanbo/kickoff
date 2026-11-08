// グループと「No Group」の並び（全プロジェクトのボードのグループの列・サイドバーで共通。純粋関数）

/**
 * グループの並びの中の「No Group」の位置（前にあるグループの数）。覚えた位置（saved。-1 なら覚えていない）があればそれを、
 * グループの数より後ろならいちばん下にする。覚えていなければ、ボードは先頭・リストとサイドバーはいちばん下（list。スイムレーンと同じ）。
 * 覚える位置はボード・リスト・サイドバーで共通（groupBoardUngroupedAt）
 */
export function ungroupedPosition(saved: number, groupCount: number, list: boolean): number {
  if (saved < 0) return list ? groupCount : 0;
  return Math.min(saved, groupCount);
}

/** まとまり（自分で作ったグループ → グループなしの順）を、「No Group」を at の位置に入れた並びにする（グループどうしの順は変えない） */
export function orderGroupBuckets<B extends { kind: string }>(buckets: readonly B[], at: number): B[] {
  const groups = buckets.filter((b) => b.kind === "group");
  const ungrouped = buckets.filter((b) => b.kind === "ungrouped");
  const pos = Math.min(Math.max(at, 0), groups.length);
  return [...groups.slice(0, pos), ...ungrouped, ...groups.slice(pos)];
}

/**
 * 出しているグループ（shown。絞り込みで一部だけのこともある）を、「No Group」より前と後ろに分ける（サイドバー）。
 * at はすべてのグループの並び（allIds）の中の位置なので、出していないグループがあっても、もとの並びの中の位置で分ける
 */
export function splitAtUngrouped<G>(shown: readonly G[], idOf: (g: G) => number, allIds: readonly number[], at: number): { before: G[]; after: G[] } {
  const before: G[] = [];
  const after: G[] = [];
  for (const g of shown) {
    const index = allIds.indexOf(idOf(g));
    (index >= 0 && index < at ? before : after).push(g);
  }
  return { before, after };
}
