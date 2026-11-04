import type { ApprovalDecision } from "@shared/types";
import { api } from "@/api";
import { useSubmit } from "@/hooks/useSubmit";

/** 承認依頼・質問への回答を送る（送れたらカードごと消えるので送信中のまま。失敗したときだけ押し直せる） */
export function useResolve(id: string) {
  const { submitting, error, submit } = useSubmit();
  return { sending: submitting, error, resolve: (decision: ApprovalDecision) => submit(() => api.resolveApproval(id, decision)) };
}
