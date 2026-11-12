// Docker の作業場所の呼び名（Docker タブ・ポートの取り合いの説明・AI の守りの承認カードで同じ形にする）

/** 作業場所の文（「本体 | main」「WT | feat-x」。Git でない本体は「本体」、ブランチのないワークツリーはフォルダ名） */
export function workplaceText(worktreePath: string | null, branch: string | null): string {
  if (worktreePath === null) return branch ? `本体 | ${branch}` : "本体";
  return `WT | ${branch ?? worktreePath.split("/").pop() ?? ""}`;
}
