import type { Chat } from "@shared/chat/types";
import { moveInList, type DropSide } from "@/foundation/ui/lib/moveInList";
import type { ChatBucket } from "./buckets";

/**
 * チャットの手動の並び（サイドバーの並び順「手動」。Chat.position）。
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
 * チャットの ID → 並べ替えられる範囲（いちばん外のまとまりのキー。中の固定は /pinned、アーカイブ済みはそのキー）。
 * ドラッグで並べ替えられるのは、同じ範囲のチャットどうしだけ（グループをまたぐ移動はグループのドロップ）
 */
export function bucketScopes(buckets: readonly ChatBucket[]): Map<number, string> {
  const scopes = new Map<number, string>();
  for (const b of buckets) {
    for (const c of b.chats) scopes.set(c.id, c.pinned && !c.archived_at && b.kind !== "pinned" ? `${b.key}/pinned` : b.key);
    for (const c of b.archived?.chats ?? []) scopes.set(c.id, b.archived!.key);
  }
  return scopes;
}

/** 下書きのタブの、一覧のペインでの位置（チャットのタブのチャットの ID をペインの並びで・下書きのタブより前にあるチャットのタブの数） */
export interface DraftTabSpot {
  chatIds: readonly number[];
  before: number;
}

/**
 * 手動の並びで、下書きの行を置くチャット（その行のすぐ後ろに置く。タブの位置に合わせる）。一覧のペインのチャットのタブは
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

/** 親のないチャットにした moved を、並び ids の target の前後へ入れた並び（ids になければ足す。target がなければ null） */
export function insertNear(ids: readonly number[], moved: number, target: number, side: DropSide): number[] | null {
  if (moved === target || !ids.includes(target)) return null;
  const list = ids.includes(moved) ? ids : [...ids, moved];
  return moveInList(list, moved, target, side) ?? [...list];
}
