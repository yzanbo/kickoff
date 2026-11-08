import type { Chat } from "@shared/types";
import type { ChatBucket } from "./buckets";

/**
 * チャットの手動の並び（サイドバーの並び順「手動」。Chat.position。利用者の依頼）。
 * プロジェクトの中の 1 つの並びで、まとまり（グループ・作業場所・固定・アーカイブ済み）の中はこの順に並べる。
 * まだ並べていない（position が null の）新しいチャットは、まとまりのいちばん上に新しい順
 */
export const byManual = (a: Chat, b: Chat): number => {
  if (a.position === null || b.position === null) {
    if (a.position === b.position) return b.id - a.id;
    return a.position === null ? -1 : 1;
  }
  return a.position - b.position || b.id - a.id;
};

/**
 * チャットの ID → 並べ替えられる範囲（いちばん外のまとまりのキー。まとまりのアーカイブ済みはそのキー）。
 * ドラッグで並べ替えられるのは、同じ範囲のチャットどうしだけ（グループをまたぐ移動はグループのドロップ）
 */
export function bucketScopes(buckets: readonly ChatBucket[]): Map<number, string> {
  const scopes = new Map<number, string>();
  for (const b of buckets) {
    for (const c of b.chats) scopes.set(c.id, b.key);
    for (const c of b.archived?.chats ?? []) scopes.set(c.id, b.archived!.key);
  }
  return scopes;
}

/** order（チャットの ID の並び）の moved を target の前（before）か後ろ（after）へ動かした並び。動かせない・変わらないなら null */
export function moveChatInOrder(order: readonly number[], moved: number, target: number, side: "before" | "after"): number[] | null {
  if (moved === target || !order.includes(moved) || !order.includes(target)) return null;
  const rest = order.filter((id) => id !== moved);
  const at = rest.indexOf(target) + (side === "after" ? 1 : 0);
  const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return next.every((id, i) => id === order[i]) ? null : next;
}
