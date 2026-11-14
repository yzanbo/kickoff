// チャットの AI がワークツリーを片付ける（kickoff_chat の finish_worktree の中身。プロバイダーに依らない。メモの仕様書「0019_AI の操作ツールの追加」の F）。
// 確かめ・控え・予約は worktrees/finish.ts の WorktreeFinisher。ここはツールを呼んだチャットを渡すだけ
import type { WorktreeFinisher } from "../worktrees/finish.js";

/** ワークツリーを片付けるツールの中身（できたら AI に返す文。できなければ理由の文で throw） */
export interface AiWorktreeTools {
  finish(input: { worktree?: string }): Promise<string>;
}

/** chatId のチャットの AI に渡す、ワークツリーを片付けるツールの中身（どのチャットにも渡し、消せないチャットからは理由の文で断る） */
export function createAiWorktreeTools(finisher: WorktreeFinisher, chatId: number): AiWorktreeTools {
  return { finish: ({ worktree }) => finisher.finishFromChat(chatId, worktree) };
}
