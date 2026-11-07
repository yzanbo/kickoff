import { randomUUID } from "node:crypto";
import type { Bus } from "../bus.js";
import type { ApprovalRequest } from "../providers/types.js";
import type { Approval, ApprovalDecision } from "@shared/types";
import { Conflict } from "../http/errors.js";

interface Pending {
  approval: Approval;
  resolve: (decision: ApprovalDecision) => void;
}

/**
 * エージェントからの承認依頼・質問を保持し、ユーザー（デスクトップ・スマホ）の回答を待つ。
 * 回答されるまでエージェントは止まって待つ。
 */
export class ApprovalCenter {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly bus: Bus) {}

  list(filter: { projectId?: number; chatId?: number } = {}): Approval[] {
    return [...this.pending.values()]
      .map((p) => p.approval)
      .filter((a) => (filter.projectId === undefined || a.project_id === filter.projectId) && (filter.chatId === undefined || a.chat_id === filter.chatId));
  }

  request(
    context: { chatId: number; projectId: number },
    req: ApprovalRequest,
    signal: AbortSignal,
  ): { approval: Approval; decision: Promise<ApprovalDecision> } {
    const approval: Approval = {
      id: randomUUID(),
      chat_id: context.chatId,
      project_id: context.projectId,
      kind: req.kind,
      tool_name: req.toolName,
      input: req.input,
      title: req.title,
      description: req.description,
      can_remember: req.canRemember,
      ...(req.toolUseId ? { tool_use_id: req.toolUseId } : {}),
      ...(req.agentId ? { agent_id: req.agentId } : {}),
      created_at: new Date().toISOString(),
    };
    const decision = new Promise<ApprovalDecision>((resolve) => {
      this.pending.set(approval.id, { approval, resolve });
      // 実行が中断されたら、回答を待たずに拒否として返す
      signal.addEventListener(
        "abort",
        () => this.settle(approval.id, { action: "deny", message: "実行が中断されました" }),
        { once: true },
      );
    });
    this.bus.publish({ type: "approval", approval });
    return { approval, decision };
  }

  /** ユーザーの回答を反映する。もう待っていない（回答済み・中断済み）なら 409 */
  resolve(id: string, decision: ApprovalDecision): void {
    if (!this.settle(id, decision)) throw new Conflict("この依頼はすでに回答済みか、中断されています");
  }

  private settle(id: string, decision: ApprovalDecision): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    this.pending.delete(id);
    p.resolve(decision);
    this.bus.publish({ type: "approval_resolved", id, chat_id: p.approval.chat_id });
    return true;
  }
}
