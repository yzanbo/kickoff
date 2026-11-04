import type { Approval, ApprovalDecision } from "@shared/types";
import { request } from "./http";

/** 回答待ち: ツールの承認依頼・AI からの質問・再開するかの確かめ（コアの routes/approvals.ts） */
export const approvalsApi = {
  approvals: () => request<Approval[]>("GET", "/api/approvals"),
  resolveApproval: (id: string, decision: ApprovalDecision) => request<void>("POST", `/api/approvals/${id}`, decision),
};
