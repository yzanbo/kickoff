// 1 回の作業の文脈（AiTurn）をチャットと実行の口から作る。ツールが利用者に聞くカードは、実行の承認（requestApproval）に渡す
import type { AiApprovalCard, AiTurn } from "@/foundation/core/aiTools/tool";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import type { Chat } from "@shared/chat/types";

/** 実行の承認の口（プロバイダーの callbacks.requestApproval） */
type RequestApproval = (request: { kind: "permission" } & AiApprovalCard, signal: AbortSignal) => Promise<ApprovalDecision>;

/** chat の今回の作業の文脈（workdir はその作業場所。止めたら signal で止まり、聞いている途中なら断りで返る） */
export function aiTurnOf(chat: Pick<Chat, "id" | "project_id" | "provider">, workdir: string, requestApproval: RequestApproval, signal: AbortSignal): AiTurn {
  const values = new Map<string, unknown>();
  return {
    chatId: chat.id,
    projectId: chat.project_id,
    provider: chat.provider,
    workdir,
    signal,
    async ask(card) {
      const decision = await requestApproval({ kind: "permission", ...card }, signal);
      if (decision.action === "allow" || decision.action === "allow_always") return { action: decision.action };
      return { action: "deny", message: decision.action === "deny" ? (decision.message ?? null) : null };
    },
    perTurn<T>(key: string, init: () => T): T {
      if (!values.has(key)) values.set(key, init());
      return values.get(key) as T;
    },
  };
}
