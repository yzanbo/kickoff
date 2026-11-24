import { autoPreCompactMessage, compactPromptFor, PRE_COMPACT_DONE, PRE_COMPACT_NUDGE } from "@shared/chat/prompts";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { preCompactSent, type TurnContributor, type ChatStoreDeps } from "@/features/chat/core/index";
import type { PreCompactRequest } from "@/features/ai/core/index";

/** そのプロジェクトで送る圧縮前指示（オンの分を、設定の共通の指示 → プロジェクトの指示の順につなぐ。どちらもなければ null） */
function preCompactPromptOf(store: Pick<ChatStoreDeps, "settings">, project: Project): string | null {
  return compactPromptFor("pre", store.settings.get(), project);
}

/**
 * 上限に近づいて自動で圧縮する前に足す圧縮前指示（ProviderTurnParams.preCompact）。
 * 指示がない・コンテキストウィンドウがまだ分からない（最初の作業）・前の圧縮のあとでもう送った（sent）なら null
 */
function autoPreCompactParams(text: string | null, chat: Chat, sent: boolean): PreCompactRequest | null {
  if (!text || !chat.context_window || sent) return null;
  return { message: autoPreCompactMessage(text), contextWindow: chat.context_window, contextTokens: chat.context_tokens, nudge: PRE_COMPACT_NUDGE, doneMark: PRE_COMPACT_DONE };
}

/**
 * 圧縮が 1 回の実行に足すもの（contributor "compact"）: 上限に近づいて自動で圧縮する前に足す圧縮前指示（手で圧縮する実行には足さない。
 * 前の圧縮・消去のあとでもう送ったかは、記録から導く印で見る）
 */
export function compactTurnParts(store: Pick<ChatStoreDeps, "settings">): TurnContributor {
  return {
    name: "compact",
    order: 50,
    contribute: ({ chat, project, request, marks }) => ({
      preCompact: autoPreCompactParams(request.compact ? null : preCompactPromptOf(store, project), chat, preCompactSent(marks)),
    }),
  };
}
