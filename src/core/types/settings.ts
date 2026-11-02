// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// プロバイダー・推論の深さ・権限モードの定数と、アプリ全体の設定
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

/** 権限モード（Claude Code の permissionMode と同じ意味。ファイルの編集を自動で承認するかもこれだけで決まる） */
export const PERMISSION_CHOICES = ["default", "acceptEdits", "auto", "plan"] as const;
export type PermissionChoice = (typeof PERMISSION_CHOICES)[number];

export const PERMISSION_LABELS: Record<PermissionChoice, string> = {
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
  /** 新しいチャットの既定の推論の深さ（null なら指定しない＝モデルの既定） */
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
  defaultPermission: "default",
  defaultFastMode: false,
  remoteEnabled: false,
  ntfyUrl: "",
  desktopNotifications: true,
  projectsDir: "~/Documents",
  autoArchiveDays: null,
};
