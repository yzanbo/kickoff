import { useState } from "react";
import type { ApprovalDecision } from "../../../../core/types";
import { api } from "../../api";
import { useActionError } from "../../hooks/useActionError";

/** 承認依頼・質問への回答を送る（送れたらカードごと消えるので送信中のまま。失敗したときだけ押し直せる） */
export function useResolve(id: string) {
  // 送れたらカードごと消えるので、送信中のままにしておく（失敗したときだけ押し直せるようにする）
  const [sending, setSending] = useState(false);
  const { error, setError, guard } = useActionError();
  async function resolve(decision: ApprovalDecision) {
    setSending(true);
    setError(undefined);
    if (!(await guard(() => api.resolveApproval(id, decision)))) setSending(false);
  }
  return { sending, error, resolve };
}
