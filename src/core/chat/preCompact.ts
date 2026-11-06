import { autoPreCompactMessage, compactPromptFor } from "@shared/chat/prompts";
import { randomUUID } from "node:crypto";
import type { Chat, Project, QueuedMessage } from "@shared/types";
import type { Store } from "../db/store.js";
import type { ProviderTurnParams } from "../providers/types.js";

/** そのプロジェクトで送る圧縮前指示（オンの分を、設定の共通の指示 → プロジェクトの指示の順につなぐ。どちらもなければ null） */
export function preCompactPromptOf(store: Store, project: Project): string | null {
  return compactPromptFor("pre", store.settings.get(), project);
}

/** そのプロジェクトで送る圧縮後指示（オンの分を、設定の共通の指示 → プロジェクトの指示の順につなぐ。どちらもなければ null） */
export function postCompactPromptOf(store: Store, project: Project): string | null {
  return compactPromptFor("post", store.settings.get(), project);
}

/**
 * 圧縮後指示を、圧縮が終わったら伝える「いま」（ChatLive の after_compact）の先頭に置く形にする。
 * 預かった指示と同じ口（Runner の deliverAfterCompact / deliverHeld）で、それらより先に送る
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
  return { message: autoPreCompactMessage(text), contextWindow: chat.context_window, contextTokens: chat.context_tokens };
}
