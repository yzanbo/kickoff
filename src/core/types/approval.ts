// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// エージェントからの承認依頼・質問と、ユーザーの回答
import type { Attachment } from "./run.js";
/**
 * permission: ツールの承認 / question: AI からの質問 / reconnect: 通信の切断で止まり、自動の再開を何度か試しても続かなかった（再開するかを聞く）/
 * usage_limit: 使用枠の上限で止まり、枠が戻った（続けるかを聞く）
 */
export type ApprovalKind = "permission" | "question" | "reconnect" | "usage_limit";

export interface QuestionOption {
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
  run_id: number;
  project_id: number;
  kind: ApprovalKind;
  tool_name: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  can_remember: boolean;
  created_at: string;
}

export type ApprovalDecision =
  | { action: "allow" }
  | { action: "allow_always" }
  | { action: "deny"; message?: string }
  /**
   * attachments: 質問ごとの「その他」に添えた添付（画面から送るときだけ。コアが回答の文に添付のパスを書き添えてから
   * Claude Code に渡す。AskUserQuestion の回答は文字だけなので、画像は Read ツールで読んでもらう。チャットの添付と同じ）
   */
  | { action: "answer"; answers: Record<string, string | string[]>; response?: string; attachments?: Record<string, Attachment[]> };
