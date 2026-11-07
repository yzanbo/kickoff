// グループのボードの、グループと「No Group」の並び（純粋関数）

/**
 * グループの並びの中の「No Group」の位置（前にあるグループの数）。覚えた位置（saved。-1 なら覚えていない）があればそれを、
 * グループの数より後ろならいちばん下にする。覚えていなければ、ボードは先頭・リストはいちばん下（スイムレーンと同じ）
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
