// チャットの AI が自分のチャットの作業場所を移すツール（kickoff_chat の move_workplace・cancel_workplace_move）の、
// コアと画面で共有する名前・移す先の種類・記録の行に出す文

/** 作業場所を移す予約のツールの名前 */
export const AI_MOVE_WORKPLACE_TOOL = "mcp__kickoff_chat__move_workplace";
/** 作業場所を移す予約を取り消すツールの名前 */
export const AI_CANCEL_WORKPLACE_MOVE_TOOL = "mcp__kickoff_chat__cancel_workplace_move";

/** 移す先の種類（本体・いまあるワークツリー・新しいワークツリー） */
export const AI_WORKPLACE_TARGETS = ["main", "worktree", "new_worktree"] as const;
export type AiWorkplaceTarget = (typeof AI_WORKPLACE_TARGETS)[number];

/** 記録の行に出す文（どこへ移すか。変更を持っていくなら添える） */
export function describeMoveWorkplace(input: Record<string, unknown>): string {
  const name = (key: string) => (typeof input[key] === "string" && (input[key] as string).trim() ? (input[key] as string).trim() : null);
  const named = (head: string, key: string) => (name(key) ? `${head}（${name(key)}）` : head);
  const place = input.to === "main" ? "本体" : input.to === "new_worktree" ? named("新しいワークツリー", "branch") : named("ワークツリー", "worktree");
  return input.carry === true ? `${place}（変更を持っていく）` : place;
}

/** 作業中の様子に出す予約の文（パソコンの画面とスマホで同じ） */
export function workplaceMoveReservationText(r: { label: string; carry: boolean; continuation: boolean }): string {
  return `作業が終わったら${r.label}へ移ります${r.carry ? "（コミットしていない変更も持っていきます）" : ""}。${r.continuation ? "移したら AI が続けます" : "移すだけで、続きは送りません"}`;
}
