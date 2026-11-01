// コア・UI・将来のモバイルアプリで共有するドメイン型
// （このファイルは型と定数のみ。Node 依存を持ち込まないこと）

// 開発のセクション（サイドバーでプロジェクトの下に並び、それぞれにチャットがぶら下がる）。
// 順番の決まった工程ではなく、どのセクションでもいつでもチャットできる。
export const PHASES = ["requirements", "schedule", "implementation", "testing", "deployment"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  requirements: "要件定義",
  schedule: "スケジュール",
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

export const ARTIFACT_KINDS = ["requirements", "schedule", "design", "test_report", "deploy_log", "note"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  requirements: "要件定義書",
  schedule: "スケジュール",
  design: "設計メモ",
  test_report: "テストレポート",
  deploy_log: "デプロイログ",
  note: "メモ",
};

export const PROVIDER_IDS = ["claude", "codex", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/**
 * 権限モード。"phase" はセクションごとの既定（要件定義は読み取り中心、実装は編集を自動承認 など）。
 * それ以外は Claude Code の permissionMode と同じ意味。
 */
export const PERMISSION_CHOICES = ["phase", "default", "acceptEdits", "auto", "plan"] as const;
export type PermissionChoice = (typeof PERMISSION_CHOICES)[number];

export const PERMISSION_LABELS: Record<PermissionChoice, string> = {
  phase: "セクション既定",
  default: "毎回確認",
  acceptEdits: "編集を自動承認",
  auto: "Auto mode",
  plan: "計画のみ",
};

/** チャット欄で選べるモデル */
export interface ModelOption {
  value: string;
  label: string;
  description: string;
  efforts: EffortLevel[];
  supportsAutoMode: boolean;
  supportsFastMode: boolean;
}

/** 実行ごとに選べるオプション（チャット欄の選択） */
export interface RunOptions {
  model?: string | null;
  effort?: EffortLevel | null;
  permission_mode?: PermissionChoice | null;
  fast_mode?: boolean | null;
}

/** カンバンの列（あなたが動かす進み具合） */
export const BOARD_STAGES = ["todo", "doing", "review", "done"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

export const BOARD_STAGE_LABELS: Record<BoardStage, string> = {
  todo: "未着手",
  doing: "対応中",
  review: "レビュー",
  done: "完了",
};

/**
 * エージェント自身の状態（状態の分け方に合わせる）。
 * needs_input: 承認・回答待ち / failed: エラー / running: 作業中 / attention: 終わって確認待ち / done: 待機中
 */
export const AGENT_STATES = ["needs_input", "failed", "attention", "running", "done"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  needs_input: "回答待ち",
  failed: "エラー",
  attention: "確認待ち",
  running: "作業中",
  done: "待機中",
};

export type RunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";

export interface Project {
  id: number;
  name: string;
  description: string;
  repo_path: string;
  provider: ProviderId;
  test_command: string;
  deploy_instructions: string;
  auto_commit: number; // SQLite の真偽値（0 / 1）
  /** セクションごとの書き込みできるフォルダ（リポジトリからの相対パス。未指定なら既定の docs） */
  write_scopes: WriteScopes;
  /** このプロジェクトの既定（書いていない項目はアプリ全体の設定に従う） */
  defaults: ProjectDefaults;
  /** 参照資料（AI がいつでも読めるフォルダ・ファイル。絶対パス） */
  references: ProjectReference[];
  /** サイドバーでの並び順（小さいほど前） */
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * プロジェクトごとの既定。キーがなければアプリ全体の設定に従う。
 * effort の null は「セクションに合わせる」、permission の "phase" も同じ意味。
 */
export interface ProjectDefaults {
  model?: string;
  effort?: EffortLevel | null;
  permission?: PermissionChoice;
  fastMode?: boolean;
  /** 新しいチャットのセクション（なければ直近のチャットと同じ） */
  section?: Phase;
  /** 新しいチャットを置くカンバンの列（なければ状態から決める） */
  stage?: BoardStage;
}

/** 参照資料の 1 件（AI は読むだけで、書き込めない） */
export interface ProjectReference {
  path: string;
  kind: "folder" | "file";
}

/** 書き込み範囲を制限するセクション */
export const SCOPED_SECTIONS = ["requirements", "schedule"] as const;
export type ScopedSection = (typeof SCOPED_SECTIONS)[number];
export type WriteScopes = Partial<Record<ScopedSection, string[]>>;

export interface ProjectSummary extends Project {
  task_counts: Record<TaskStatus, number>;
  /** フェーズごとのタスク数（done は完了したもの） */
  phase_task_counts: Record<Phase, { total: number; done: number }>;
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
  /** 推論の深さ（null ならフェーズ既定） */
  effort: EffortLevel | null;
  permission_mode: PermissionChoice;
  /** ファストモードを指定したか（SQLite の真偽値 0 / 1） */
  fast_mode: number;
  cost_usd: number;
  num_turns: number;
  result: string | null;
  error: string | null;
  /** カンバンの列。null なら状態から決める（確認待ちはレビュー、それ以外は対応中） */
  stage: BoardStage | null;
  /** AI の作業が終わって、まだ開いて確認していない（SQLite の真偽値 0 / 1） */
  attention: number;
  /** アーカイブした日時（null なら一覧に出す） */
  archived_at: string | null;
  /** 自分で作ったグループ（null ならグループなし） */
  group_id: number | null;
  /** 最後の応答の時点でコンテキストに入っていたトークン数と、その上限（まだ応答がなければ null） */
  context_tokens: number | null;
  context_window: number | null;
  created_at: string;
  updated_at: string;
}

/** チャットを自分でまとめるグループ（プロジェクトごと） */
export interface RunGroup {
  id: number;
  project_id: number;
  name: string;
  /** 並び順（小さいほど上・左） */
  position: number;
  created_at: string;
  updated_at: string;
}

/** チャットのやり取りの検索結果（1 件 = 1 つの発言） */
export interface SearchHit {
  event_id: number;
  run_id: number;
  project_id: number;
  run_title: string;
  phase: Phase;
  /** user: 自分の発言 / text: AI の返答 */
  type: "user" | "text";
  /** キーワードの前後を切り出した文（match_start〜match_end がキーワード） */
  snippet: string;
  match_start: number;
  match_end: number;
  created_at: string;
}

/** チャットの添付ファイル */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export type RunEventData =
  | { type: "user"; text: string; attachments?: Attachment[] }
  | { type: "init"; model?: string; session_id: string; permission_mode?: string }
  /** sub: サブエージェントの発言。parent: そのサブエージェントを起動した Task / Agent ツールの呼び出し ID */
  | { type: "text"; text: string; sub?: boolean; parent?: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; sub?: boolean; parent?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean; parent?: string }
  | { type: "approval"; approval_id: string; kind: ApprovalKind; tool_name: string; title?: string }
  | { type: "approval_resolved"; approval_id: string; action: ApprovalDecision["action"] }
  | { type: "result"; status: RunStatus; text?: string; cost_usd?: number; turns?: number }
  | { type: "error"; message: string }
  | { type: "notice"; message: string }
  /** サブエージェントの開始・終了（途中経過は保存せず、run_subagent で届く） */
  | ({ type: "subagent" } & SubagentInfo);

/** サブエージェント（Task / Agent ツールで起動された別のエージェント）の状態 */
export interface SubagentInfo {
  task_id: string;
  /** 起動した Task / Agent ツールの呼び出し ID（タイムラインの呼び出しと結びつける） */
  tool_use_id?: string;
  description: string;
  subagent_type?: string;
  status: "running" | "completed" | "failed" | "stopped";
  tokens?: number;
  tool_uses?: number;
  duration_ms?: number;
  /** 直近に使ったツール（途中経過） */
  last_tool?: string;
  summary?: string;
}

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
  /** 新しいチャットの既定のモデル（Claude） */
  claudeModel: string;
  /** 新しいチャットの既定の推論の深さ（null ならセクション既定） */
  defaultEffort: EffortLevel | null;
  /** 新しいチャットの既定の権限モード */
  defaultPermission: PermissionChoice;
  /** 新しいチャットで既定でファストモードを使うか */
  defaultFastMode: boolean;
  /** スマホなど他端末からのアクセスを許可（LAN に公開） */
  remoteEnabled: boolean;
  /** ntfy のトピック URL（空なら通知しない） */
  ntfyUrl: string;
  /** チャットの完了・失敗・回答待ちを Mac の通知で知らせる */
  desktopNotifications: boolean;
  /** 新規プロジェクトの保存先（前回使ったフォルダ） */
  projectsDir: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  maxConcurrentRuns: 2,
  defaultProvider: "claude",
  claudeModel: "opus",
  defaultEffort: null,
  defaultPermission: "phase",
  defaultFastMode: false,
  remoteEnabled: false,
  ntfyUrl: "",
  desktopNotifications: true,
  projectsDir: "~/Documents",
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

/** サブスクリプションの使用枠（5 時間・週など）の 1 区分 */
export interface UsageWindow {
  key: string;
  label: string;
  /** 使用率 0〜100。枠が始まっていなければ null */
  utilization: number | null;
  resets_at: string | null;
}

export interface PlanUsage {
  /** どの AI のプランか（Codex・Gemini に対応したときも同じ形で返す） */
  provider: ProviderId;
  /** 表示名（"Claude" など） */
  provider_label: string;
  /** プランの使用枠が取得できたか（API キー利用時などは false） */
  available: boolean;
  plan: string | null;
  five_hour: UsageWindow;
  seven_day: UsageWindow;
  /** モデル別の週枠（例: Fable） */
  model_weekly: UsageWindow[];
  /** 追加の使用枠（extra usage）。わからなければ null */
  extra_usage?: { enabled: boolean; utilization: number | null } | null;
  fetched_at: string;
  error?: string;
}

/** Kickoff サーバー（コア）の状態（画面の左下の接続の詳細） */
export interface ServerStatus {
  version: string;
  started_at: string;
  /** 待ち受けているアドレス（127.0.0.1 ならこの Mac からだけ） */
  host: string;
  port: number;
  /** スマホなど、ほかの端末からの接続を許可しているか */
  remote_enabled: boolean;
  agents: { running: number; queued: number; max: number };
}

export interface GitHubStatus {
  installed: boolean;
  loggedIn: boolean;
  account?: string;
  detail: string;
}

/** 既存フォルダの点検結果（取り込みダイアログ用） */
export interface WorkspaceInspection {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  isGit: boolean;
  gitRoot: string | null;
  hasCommits: boolean;
  branch: string | null;
  remoteUrl: string | null;
  dirty: boolean;
  suggestedName: string;
  registered_project_id?: number | null;
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
  | { type: "run_deleted"; id: number; project_id: number }
  | { type: "group"; group: RunGroup }
  | { type: "group_deleted"; id: number; project_id: number }
  | { type: "run_event"; project_id: number; event: RunEvent }
  /** AI の返答の途中経過（保存しない。確定した文は run_event の text で届く） */
  | { type: "run_delta"; project_id: number; run_id: number; text: string }
  /** サブエージェントの途中経過（トークン数・直近のツール。保存しない） */
  | { type: "run_subagent"; project_id: number; run_id: number; subagent: SubagentInfo }
  | { type: "artifact"; artifact: Artifact }
  | { type: "approval"; approval: Approval }
  | { type: "approval_resolved"; id: string; run_id: number }
  | { type: "autopilot"; project_id: number; phase: Phase; enabled: boolean }
  | { type: "settings"; settings: AppSettings }
  | { type: "usage"; usage: PlanUsage };
