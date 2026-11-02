// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// エージェントからの承認依頼・質問と、ユーザーの回答
export type ApprovalKind = "permission" | "question";

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
  task_id: number | null;
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
  | { action: "answer"; answers: Record<string, string | string[]>; response?: string };
