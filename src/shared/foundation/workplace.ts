// 作業場所の形と呼び名（ワークツリーの形は土台の作業場所・git・worktrees が共有する。呼び名は Docker タブ・ポートの取り合いの説明・AI の守りの承認カードで同じ形にする）

/** 作業場所の文（「本体 | main」「WT | feat-x」。Git でない本体は「本体」、ブランチのないワークツリーはフォルダ名） */
export function workplaceText(worktreePath: string | null, branch: string | null): string {
  if (worktreePath === null) return branch ? `本体 | ${branch}` : "本体";
  return `WT | ${branch ?? worktreePath.split("/").pop() ?? ""}`;
}

/** git のワークツリー（同じリポジトリの別のブランチを、別のフォルダに取り出したもの） */
/** 実行環境（env）は worktrees が足す（@shared/worktrees/envTypes） */
export interface GitWorktree {
  /** 作業するフォルダ（プロジェクトのフォルダがリポジトリの中のフォルダなら、ワークツリーの中の同じ位置のフォルダ。チャットの worktree_path・?worktree= はこれ） */
  path: string;
  /** ワークツリーの一番上のフォルダ（git が取り出している場所。プロジェクトのフォルダがリポジトリの一番上なら path と同じ） */
  root: string;
  /** 取り出しているブランチ（ブランチから外れていれば null） */
  branch: string | null;
  head: string;
  /** 本体（最初に作ったフォルダ。消せない） */
  main: boolean;
  locked: boolean;
  /** フォルダがなくなっていて、片付けられる */
  prunable: boolean;
  /** この作業場所に保存された色相 */
  hue?: number;
}
