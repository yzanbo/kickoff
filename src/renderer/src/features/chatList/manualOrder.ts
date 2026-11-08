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

/** 下書きのタブの、一覧のペインでの位置（チャットのタブのチャットの ID をペインの並びで・下書きのタブより前にあるチャットのタブの数） */
export interface DraftTabSpot {
  chatIds: readonly number[];
  before: number;
}

/**
 * 手動の並びで、下書きの行を置くチャット（その行のすぐ後ろに置く。利用者の依頼で、タブの位置に合わせる）。一覧のペインのチャットのタブは
 * サイドバーの並び（orderOf）でチャットのタブの位置どうしを入れ替え、下書きのタブの位置は変えない（tabClusters.ts の orderLikeSidebar）ので、
 * 下書きのタブより前に見えるのは、並べ替えたチャットのタブの先頭から before 個。その中で、下書きと同じまとまりに出すチャット（eligible）の
 * いちばん後ろのもの。なければ null（まとまりのいちばん上に置く）
 */
export function draftAnchor(spot: DraftTabSpot, orderOf: ReadonlyMap<number, number>, eligible: (chatId: number) => boolean): number | null {
  const rank = (id: number) => orderOf.get(id) ?? Number.MAX_SAFE_INTEGER;
  // 同じ順位（並びにないもの）どうしはペインの順のまま（sort は安定。orderLikeSidebar と同じ）
  const shown = [...spot.chatIds].sort((a, b) => rank(a) - rank(b)).slice(0, spot.before);
  for (let i = shown.length - 1; i >= 0; i--) if (eligible(shown[i])) return shown[i];
  return null;
}
