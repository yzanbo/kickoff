// エージェントからの承認依頼・質問と、ユーザーの回答
import type { Attachment } from "./types";
/**
 * permission: ツールの承認 / question: AI からの質問 / reconnect: 通信の切断で止まり、自動の再開を何度か試しても続かなかった（再開するかを聞く）/
 * usage_limit: 使用枠の上限で止まり、枠が戻った（続けるかを聞く）
 */
export type ApprovalKind = "permission" | "question" | "reconnect" | "usage_limit";

/**
 * 承認カードの「覚える」ボタンの範囲: rule = 許可のルールに足して今後は聞かない（常に許可）/
 * chat = このチャットの間だけ同じものを聞かない（このチャットでは許可。AI の書き込み先の守りが、作業場所の外のファイルを聞くとき）
 */
const REMEMBER_SCOPES = ["rule", "chat"] as const;
export type RememberScope = (typeof REMEMBER_SCOPES)[number];

/** 「覚える」ボタンの文言（label）と説明（title） */
export const REMEMBER_SCOPE_LABELS: Record<RememberScope, { label: string; title: string }> = {
  rule: { label: "常に許可", title: "同じ種類の操作を今後は確認しない" },
  chat: { label: "このチャットでは許可", title: "このチャットでは、同じファイルへの書き込みをもう確認しない" },
};

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

export type ApprovalDecision =
  | { action: "allow" }
  | { action: "allow_always" }
  | { action: "deny"; message?: string }
  /**
   * attachments: 質問ごとの「その他」に添えた添付（画面から送るときだけ。コアが回答の文に添付のパスを書き添えてから
   * Claude Code に渡す。AskUserQuestion の回答は文字だけなので、画像は Read ツールで読んでもらう。チャットの添付と同じ）。
   * plain: 選んだままの回答（attachments の添付のパスを書き添える前。コアが付け、チャットの記録 approval_resolved に残して画面に出す）
   */
  | { action: "answer"; answers: Record<string, string | string[]>; response?: string; attachments?: Record<string, Attachment[]>; plain?: Record<string, string | string[]> };
