import { autoPreCompactMessage, preCompactPromptFor } from "@shared/chat/prompts";
import type { Chat, Project } from "@shared/types";
import type { Store } from "../db/store.js";
import type { ProviderTurnParams } from "../providers/types.js";

/** そのプロジェクトで送る圧縮前指示（設定の共通の指示 → プロジェクトの指示の順につなぐ。どちらもなければ null） */
export function preCompactPromptOf(store: Store, project: Project): string | null {
  return preCompactPromptFor(store.settings.get().pre_compact_prompt, project.pre_compact_prompt);
}

/**
 * 上限に近づいて自動で圧縮する前に足す圧縮前指示（ProviderTurnParams.preCompact）。
 * 指示がない・コンテキストウィンドウがまだ分からない（最初の作業）・前の圧縮のあとでもう送った（sent）なら null
 */
export function autoPreCompactParams(text: string | null, chat: Chat, sent: boolean): ProviderTurnParams["preCompact"] {
  if (!text || !chat.context_window || sent) return null;
  return { message: autoPreCompactMessage(text), contextWindow: chat.context_window, contextTokens: chat.context_tokens };
}
