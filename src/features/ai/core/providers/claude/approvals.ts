import type { CanUseTool, PermissionResult, PermissionUpdate } from "./wire";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import type { ApprovalRequest, ProviderCallbacks } from "@/features/ai/core/providers/types";
import { SANDBOX_NETWORK_TOOL } from "./sandbox";

/** canUseTool に渡される指定のうち、承認依頼の組み立てに使うもの */
type ToolOptions = Pick<Parameters<CanUseTool>[2], "title" | "description" | "decisionReason" | "suggestions" | "suppressAlwaysAllowRule" | "toolUseID" | "agentID">;

/**
 * ツールの呼び出しを、ユーザーへの承認依頼にする（AskUserQuestion は質問、それ以外は許可）。
 * どの呼び出し・どのサブエージェントのものか（toolUseID・agentID）も添え、画面がサブエージェントごとに回答待ちを見せられるようにする
 */
function approvalRequestFor(toolName: string, input: Record<string, unknown>, opts: ToolOptions): ApprovalRequest {
  const origin = { toolUseId: opts.toolUseID, ...(opts.agentID ? { agentId: opts.agentID } : {}) };
  if (toolName === "AskUserQuestion") return { kind: "question", toolName, input, title: opts.title, canRemember: false, ...origin };
  return {
    kind: "permission",
    toolName,
    input,
    title: opts.title,
    description: opts.description ?? opts.decisionReason,
    canRemember: !opts.suppressAlwaysAllowRule && (opts.suggestions?.length ?? 0) > 0,
    ...origin,
  };
}

/** ユーザーの回答を Claude Code の判定にする */
function toPermissionResult(request: ApprovalRequest, decision: ApprovalDecision, suggestions: PermissionUpdate[] | undefined): PermissionResult {
  const { input } = request;
  if (request.kind === "question") {
    // 質問への回答は入力に足して通す。答えなければ、質問をスキップしたとして断る
    if (decision.action === "answer") {
      return { behavior: "allow", updatedInput: { ...input, answers: decision.answers, ...(decision.response ? { response: decision.response } : {}) } };
    }
    return { behavior: "deny", message: decision.action === "deny" && decision.message ? decision.message : "ユーザーは質問への回答をスキップしました" };
  }
  switch (decision.action) {
    case "allow":
      return { behavior: "allow", updatedInput: input };
    case "allow_always":
      // 提案された許可ルールを適用（localSettings ならリポジトリの .claude/settings.local.json に保存される）
      return { behavior: "allow", updatedInput: input, updatedPermissions: suggestions ?? [] };
    case "deny":
      return { behavior: "deny", message: decision.message || "ユーザーが拒否しました" };
    default:
      return { behavior: "deny", message: "不正な応答です" };
  }
}

/** Claude Code の canUseTool: 承認依頼を組み立てて Kickoff（画面）に回答を求め、判定にして返す */
export function createCanUseTool(cb: Pick<ProviderCallbacks, "requestApproval">): CanUseTool {
  return async (toolName, input, opts) => {
    // 砂場の中継の承認（Kickoff の中継が起こせず Claude Code の中継を使うときだけ来る）は聞かずに許す（ネットワークは絞らない。sandbox.ts）
    if (toolName === SANDBOX_NETWORK_TOOL) return { behavior: "allow", updatedInput: input };
    const request = approvalRequestFor(toolName, input, opts);
    const decision = await cb.requestApproval(request, opts.signal);
    return toPermissionResult(request, decision, opts.suggestions);
  };
}
