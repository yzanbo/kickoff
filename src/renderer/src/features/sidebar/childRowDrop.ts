import type { Chat } from "@shared/types";
import { ancestorsOf, rootChatOf } from "@/features/chat/children/childChats";

/**
 * 子チャットの行をサイドバーの行に重ねたときの扱い（子チャットを親から外す。2026-11-14 に利用者と決めた。メモの仕様書「子チャットを親から外す」）:
 * into = 重ねた行（自分の先祖。いまの親は除く）の子に上げる / between = 親のないチャットにして、その行の前後へ置く（まとめないときの一覧の行の間）/
 * block = 落とせない（同じ家系の先祖でない行: いまの親・自分・兄弟・自分の子孫など。外側のグループの落とし先へも渡さない）/
 * null = 行では受けない（子チャットでない・ほかのプロジェクト・ほかのまとまりの行。外側の落とし先に任せる）
 */
export type ChildRowDrop = "into" | "between" | "block";

type DropChat = Pick<Chat, "id" | "parent_chat_id" | "project_id" | "pinned" | "archived_at">;

/** flatList: まとめないときの一覧か（グループ別・作業場所別では、行の間でなくまとまりの見出しへ落とす） */
export function childRowDrop<T extends DropChat>(dragged: T, target: T, lookup: (id: number) => T | undefined, flatList: boolean): ChildRowDrop | null {
  if (dragged.parent_chat_id === null || dragged.project_id !== target.project_id) return null;
  if (rootChatOf(dragged, lookup).id === rootChatOf(target, lookup).id) {
    // 上げられるのは自分の先祖のうち、いまの親より上だけ
    return ancestorsOf(dragged, lookup).slice(0, -1).some((a) => a.id === target.id) ? "into" : "block";
  }
  if (flatList && target.parent_chat_id === null && !target.pinned && target.archived_at === null) return "between";
  return null;
}

/** 親のないチャットにした moved を、並び ids の target の前後へ入れた並び（target がなければ null） */
export function insertNear(ids: readonly number[], moved: number, target: number, side: "before" | "after"): number[] | null {
  const rest = ids.filter((id) => id !== moved);
  const at = rest.indexOf(target);
  if (at < 0) return null;
  const to = at + (side === "after" ? 1 : 0);
  return [...rest.slice(0, to), moved, ...rest.slice(to)];
}
