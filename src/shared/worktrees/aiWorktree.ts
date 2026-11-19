// チャットの AI がワークツリーを片付けるツール（kickoff_chat の finish_worktree）の、コアと画面で共有する名前と、記録の行に出す文

/** ワークツリーを片付けるツールの名前 */
export const AI_FINISH_WORKTREE_TOOL = "mcp__kickoff_chat__finish_worktree";

/** 記録の行に出す文（どのワークツリーか。省いたらこのチャットのワークツリー） */
export function describeFinishWorktree(input: Record<string, unknown>): string {
  return typeof input.worktree === "string" && input.worktree.trim() ? input.worktree.trim() : "このチャットのワークツリー";
}
