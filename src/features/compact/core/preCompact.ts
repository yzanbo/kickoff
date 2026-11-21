import { autoPreCompactMessage, compactPromptFor, PRE_COMPACT_DONE, PRE_COMPACT_NUDGE } from "@shared/chat/prompts";
import { randomUUID } from "node:crypto";
import type { Chat, QueuedMessage } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { Store } from "@/features/chat/core/index";
import type { ProviderTurnParams } from "@/features/ai/core/providers/types";

/** そのプロジェクトで送る圧縮前指示（オンの分を、設定の共通の指示 → プロジェクトの指示の順につなぐ。どちらもなければ null） */
export function preCompactPromptOf(store: Store, project: Project): string | null {
  return compactPromptFor("pre", store.settings.get(), project);
}

/** そのプロジェクトで送る圧縮後指示（オンの分を、設定の共通の指示 → プロジェクトの指示の順につなぐ。どちらもなければ null） */
export function postCompactPromptOf(store: Store, project: Project): string | null {
  return compactPromptFor("post", store.settings.get(), project);
}

/**
 * 圧縮後指示を、預かった「いま」（ChatLive の after_compact）の先頭に置く形にする。
 * 預かった指示と同じ口（Runner の deliverAfterCompact / deliverHeld）で、それらより先に送る（預かった指示は、圧縮後指示のやり取りが終わってから）
 */
export function postCompactItem(text: string): QueuedMessage {
  return { id: randomUUID(), text, options: {}, attachments: [], created_at: new Date().toISOString(), post_compact: true };
}

/**
 * 上限に近づいて自動で圧縮する前に足す圧縮前指示（ProviderTurnParams.preCompact）。
 * 指示がない・コンテキストウィンドウがまだ分からない（最初の作業）・前の圧縮のあとでもう送った（sent）なら null
 */
export function autoPreCompactParams(text: string | null, chat: Chat, sent: boolean): ProviderTurnParams["preCompact"] {
  if (!text || !chat.context_window || sent) return null;
  return { message: autoPreCompactMessage(text), contextWindow: chat.context_window, contextTokens: chat.context_tokens, nudge: PRE_COMPACT_NUDGE, doneMark: PRE_COMPACT_DONE };
}
