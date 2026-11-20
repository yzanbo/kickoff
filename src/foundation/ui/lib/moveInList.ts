// 並べ替えの純粋な計算（ドラッグで落とした先の並び。ビューのタブ・タグ・グループ・チャットの手で並べた順などで共通）

/** 前に入るか後ろに入るか */
export type DropSide = "before" | "after";

/**
 * moved（1 つか、複数。複数なら並びの順のまま）を target の前（before）・後ろ（after）へ動かした並び。
 * 並びが変わらない（自分の上・すぐ前の後ろ・すぐ後ろの前・target が動かす物の中・どちらかが並びにない）なら null。
 * same は同じ物かの比べ方（既定は Object.is）。T に配列は使わない（moved の 1 つと複数を見分けられない）
 */
export function moveInList<T>(list: readonly T[], moved: T | readonly T[], target: T, side: DropSide, same: (a: T, b: T) => boolean = Object.is): T[] | null {
  const wanted = (Array.isArray(moved) ? moved : [moved]) as readonly T[];
  const has = (x: T) => wanted.some((m) => same(m, x));
  const items = list.filter(has);
  if (items.length === 0 || has(target) || !list.some((x) => same(x, target))) return null;
  const rest = list.filter((x) => !has(x));
  rest.splice(rest.findIndex((x) => same(x, target)) + (side === "after" ? 1 : 0), 0, ...items);
  return rest.every((x, i) => same(x, list[i])) ? null : rest;
}

/** 動かしても並びが変わらないか（落とす先にせず、線を出さない） */
export const isNoopMove = <T>(list: readonly T[], moved: T, target: T, side: DropSide): boolean => moveInList(list, moved, target, side) === null;
