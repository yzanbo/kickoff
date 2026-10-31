// コア・UI・将来のモバイルアプリで共有するドメイン型
// （このファイルは型と定数のみ。Node 依存を持ち込まないこと）

export const PHASES = ["requirements", "implementation", "testing", "deployment"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  requirements: "要件定義",
  implementation: "実装",
  testing: "テスト",
  deployment: "デプロイ",
};

export const TASK_STATUSES = ["todo", "in_progress", "review", "pr_open", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "TODO",
  in_progress: "実行中",
  review: "レビュー待ち",
  pr_open: "PR 作成済み",
  done: "完了",
  blocked: "ブロック",
};

export const ARTIFACT_KINDS = ["requirements", "design", "test_report", "deploy_log", "note"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  requirements: "要件定義書",
  design: "設計メモ",
  test_report: "テストレポート",
  deploy_log: "デプロイログ",
  note: "メモ",
};

export const PROVIDER_IDS = ["claude", "codex"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type RunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";

export interface Project {
  id: number;
  name: string;
  description: string;
  repo_path: string;
  provider: ProviderId;
  /** プロジェクトの現在地（人がゲートを確定すると次へ進む） */
  current_phase: Phase;
  test_command: string;
  deploy_instructions: string;
  auto_commit: number; // SQLite の真偽値（0 / 1）
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary extends Project {
  task_counts: Record<TaskStatus, number>;
  total_cost_usd: number;
  active_runs: number;
}

export interface Task {
  id: number;
  project_id: number;
  phase: Phase;
  title: string;
  description: string;
  acceptance_criteria: string;
  status: TaskStatus;
  priority: number; // 1: 高 / 2: 中 / 3: 低
  summary: string;
  /** 作業ブランチ（worktree を作ったときに設定） */
  branch: string;
  worktree_path: string;
  pr_url: string;
  created_by: "user" | "agent";
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: number;
  project_id: number;
  task_id: number | null;
  phase: Phase;
  provider: ProviderId;
  title: string;
  status: RunStatus;
  session_id: string | null;
  model: string | null;
  cost_usd: number;
  num_turns: number;
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type RunEventData =
  | { type: "user"; text: string }
  | { type: "init"; model?: string; session_id: string; permission_mode?: string }
  | { type: "text"; text: string; sub?: boolean }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; sub?: boolean }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean }
  | { type: "approval"; approval_id: string; kind: ApprovalKind; tool_name: string; title?: string }
  | { type: "approval_resolved"; approval_id: string; action: ApprovalDecision["action"] }
  | { type: "result"; status: RunStatus; text?: string; cost_usd?: number; turns?: number }
  | { type: "error"; message: string }
  | { type: "notice"; message: string };

export type RunEventType = RunEventData["type"];

export interface RunEvent {
  id: number;
  run_id: number;
  type: RunEventType;
  data: Omit<RunEventData, "type">;
  created_at: string;
}

export interface Artifact {
  id: number;
  project_id: number;
  phase: Phase;
  kind: ArtifactKind;
  title: string;
  content: string;
  file_path: string;
  run_id: number | null;
  task_id: number | null;
  created_at: string;
}

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

export interface AppSettings {
  /** 同時に実行するエージェント数の上限（プランの使用枠を守るため） */
  maxConcurrentRuns: number;
  /** 新規プロジェクトの既定プロバイダー */
  defaultProvider: ProviderId;
  /** Claude のモデル（空なら CLI の既定） */
  claudeModel: string;
  /** スマホなど他端末からのアクセスを許可（LAN に公開） */
  remoteEnabled: boolean;
  /** ntfy のトピック URL（空なら通知しない） */
  ntfyUrl: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  maxConcurrentRuns: 2,
  defaultProvider: "claude",
  claudeModel: "claude-opus-5-5",
  remoteEnabled: false,
  ntfyUrl: "",
};

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  implemented: boolean;
  installed: boolean;
  loggedIn: boolean;
  account?: string;
  plan?: string;
  detail: string;
}

export interface GitHubStatus {
  installed: boolean;
  loggedIn: boolean;
  account?: string;
  detail: string;
}

export interface PairingInfo {
  enabled: boolean;
  urls: string[];
  qr_svg: string | null;
}

/** サーバーからクライアントへ配信するイベント（SSE） */
export type BusEvent =
  | { type: "project"; project: Project }
  | { type: "project_deleted"; id: number }
  | { type: "task"; task: Task }
  | { type: "task_deleted"; id: number; project_id: number }
  | { type: "run"; run: Run }
  | { type: "run_event"; project_id: number; event: RunEvent }
  | { type: "artifact"; artifact: Artifact }
  | { type: "approval"; approval: Approval }
  | { type: "approval_resolved"; id: string; run_id: number }
  | { type: "autopilot"; project_id: number; phase: Phase; enabled: boolean }
  | { type: "settings"; settings: AppSettings };
