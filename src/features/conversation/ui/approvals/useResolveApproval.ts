import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import { api } from "@/foundation/ui/api";
import { useSubmit } from "@/foundation/ui/hooks/useSubmit";

/** 承認依頼・質問への回答を送る（送れたらカードごと消えるので送信中のまま。失敗したときだけ押し直せる） */
export function useResolve(id: string) {
  const { submitting, error, submit } = useSubmit();
  return { sending: submitting, error, resolve: (decision: ApprovalDecision) => submit(() => api.resolveApproval(id, decision)) };
}
