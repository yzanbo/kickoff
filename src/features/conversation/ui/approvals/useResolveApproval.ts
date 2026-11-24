import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import { approvalsApi } from "@/features/chat/ui";
import { useAction } from "@/foundation/ui/hooks/useAction";

/** 承認依頼・質問への回答を送る（送れたらカードごと消えるので送信中のまま。失敗したときだけ押し直せる） */
export function useResolve(id: string) {
  const { busy, error, run } = useAction<"submit">();
  const submitting = busy !== null;
  return { sending: submitting, error, resolve: (decision: ApprovalDecision) => run("submit", () => approvalsApi.resolveApproval(id, decision), { keepBusy: true }) };
}
