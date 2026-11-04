// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// プロバイダー・推論の深さ・権限モードの定数と、アプリ全体の設定
import type { VoiceProvider } from "@shared/types/voice";

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
export const PERMISSION_MODES = ["default", "acceptEdits", "auto", "plan"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const PERMISSION_LABELS: Record<PermissionMode, string> = {
  default: "毎回確認",
  acceptEdits: "編集を自動承認",
  auto: "Auto mode",
  plan: "計画のみ",
};
export interface AppSettings {
  /** 新規プロジェクトの既定プロバイダー */
  defaultProvider: ProviderId;
  /** 新しいチャットの既定のモデル（Claude） */
  claudeModel: string;
  /** 新しいチャットの既定の推論の深さ（null なら指定しない＝モデルの既定） */
  defaultEffort: EffortLevel | null;
  /** 新しいチャットの既定の権限モード */
  defaultPermission: PermissionMode;
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
  /** 通信が切れて止まったチャットを、つながったら自動で再開するか（何度か続かなければ、再開するかを聞く） */
  autoResumeOnReconnect: boolean;
  /** 完了したチャットを、この日数がたったら自動でアーカイブする（null ならしない） */
  autoArchiveDays: number | null;
  /** チャット欄の音声入力（マイクのボタン）を使うか */
  voiceEnabled: boolean;
  /** 文字起こしの方法（この Mac / OpenAI） */
  voiceProvider: VoiceProvider;
  /** 話す言語（"auto" なら自動で判別。VOICE_LANGUAGES） */
  voiceLanguage: string;
  /** この Mac で使う whisper のモデルの id（voice/models.ts の WHISPER_MODELS） */
  voiceModel: string;
  /** OpenAI 互換のサーバーの URL（空なら https://api.openai.com/v1）。API キーは設定とは別に保存し、ここには入れない */
  voiceOpenaiBaseUrl: string;
  /** OpenAI の文字起こしのモデル */
  voiceOpenaiModel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
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
  autoResumeOnReconnect: true,
  voiceEnabled: false,
  voiceProvider: "local",
  voiceLanguage: "ja",
  voiceModel: "large-v3-turbo-q5_0",
  voiceOpenaiBaseUrl: "",
  voiceOpenaiModel: "gpt-4o-transcribe",
};

/** 外部のターミナルとして開けるアプリ（id は保存に使う。app は /Applications の中の名前。開き方はメインプロセスの ipcArgs.ts） */
export const EXTERNAL_TERMINALS = [
  { id: "terminal", label: "ターミナル（Terminal.app）", app: "Terminal" },
  { id: "ghostty", label: "Ghostty", app: "Ghostty" },
  { id: "iterm", label: "iTerm2", app: "iTerm" },
  { id: "warp", label: "Warp", app: "Warp" },
  { id: "wezterm", label: "WezTerm", app: "WezTerm" },
  { id: "alacritty", label: "Alacritty", app: "Alacritty" },
  { id: "kitty", label: "kitty", app: "kitty" },
] as const;
export type ExternalTerminalId = (typeof EXTERNAL_TERMINALS)[number]["id"];

/** 外部のブラウザとして開けるアプリ（id は保存に使う。app は /Applications の中の名前。開き方はメインプロセスの ipcArgs.ts。Safari はいつも入っている） */
export const EXTERNAL_BROWSERS = [
  { id: "chrome", label: "Google Chrome", app: "Google Chrome" },
  { id: "safari", label: "Safari", app: "Safari" },
  { id: "arc", label: "Arc", app: "Arc" },
  { id: "firefox", label: "Firefox", app: "Firefox" },
  { id: "edge", label: "Microsoft Edge", app: "Microsoft Edge" },
  { id: "brave", label: "Brave", app: "Brave Browser" },
  { id: "vivaldi", label: "Vivaldi", app: "Vivaldi" },
] as const;
export type ExternalBrowserId = (typeof EXTERNAL_BROWSERS)[number]["id"];
