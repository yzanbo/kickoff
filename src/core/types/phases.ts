// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// 開発のセクション・タスクの状態・成果物の種類・プロバイダー・推論の深さ・権限モードの定数と、アプリ全体の設定
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
export interface AppSettings {
  /** 同時に実行するエージェント数の上限（プランの使用枠を守るため）。null なら上限なし */
  maxConcurrentRuns: number | null;
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
  /** 完了したチャットを、この日数がたったら自動でアーカイブする（null ならしない） */
  autoArchiveDays: number | null;
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
  autoArchiveDays: null,
};
