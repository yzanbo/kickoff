// エージェントからの承認依頼・質問と、ユーザーの回答
import type { ApprovalKind, ApprovalReply, RememberScope } from "@shared/ai/approvals";
import type { Attachment } from "./types";
interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface Approval {
  id: string;
  chat_id: number;
  project_id: number;
  kind: ApprovalKind;
  tool_name: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  can_remember: boolean;
  /** 「覚える」の範囲（can_remember のときだけ意味がある。省いたら rule） */
  remember_scope?: RememberScope;
  /** 承認を求めているツールの呼び出し ID（記録の tool_use の id。サブエージェントの中の呼び出しなら、その記録の parent でどのサブエージェントか分かる） */
  tool_use_id?: string;
  /** サブエージェントの中で動いているときの、そのサブエージェントの ID（Claude Code の agentID。中の手順が届かない深い入れ子でも分かるように） */
  agent_id?: string;
  created_at: string;
}

/**
 * 承認・質問への回答（画面・スマホが送る形。AI へ返す形 ApprovalReply に、質問の答えと拒否の理由だけ次の 2 つを足す）。
 * attachments: 質問ごとの「その他」・拒否の理由に添えた添付（画面から送るときだけ。コアが回答の文・拒否の理由に添付のパスを書き添えてから
 * AI に渡す。AskUserQuestion の回答・拒否の理由は文字だけなので、画像は Read ツールで読んでもらう。チャットの添付と同じ）。
 * plain: 書いたままの回答・拒否の理由（attachments の添付のパスを書き添える前。コアが付け、チャットの記録 approval_resolved に残して画面に出す。
 * 拒否で plain がないのは、利用者が理由を書かなかったか、利用者でなく中断で拒否になったとき）
 */
export type ApprovalDecision =
  | Exclude<ApprovalReply, { action: "answer" | "deny" }>
  | (Extract<ApprovalReply, { action: "deny" }> & { attachments?: Attachment[]; plain?: string })
  | (Extract<ApprovalReply, { action: "answer" }> & { attachments?: Record<string, Attachment[]>; plain?: Record<string, string | string[]> });
/** 回答の本文（POST /api/approvals/:approvalId。画面・スマホが送る形。plain はコアが付ける） */
export type ApprovalDecisionBody =
  | Exclude<ApprovalReply, { action: "answer" | "deny" }>
  | (Extract<ApprovalReply, { action: "deny" }> & { attachments?: Attachment[] })
  | (Extract<ApprovalReply, { action: "answer" }> & { attachments?: Record<string, Attachment[]> });
