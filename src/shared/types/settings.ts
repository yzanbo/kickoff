// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// プロバイダー・推論の深さ・権限モードの定数と、アプリ全体の設定
import type { ChatOptions } from "./chat";
import type { VoiceProvider } from "./voice";

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
  default_provider: ProviderId;
  /** 新しいチャットの既定の選択（モデルは既定のプロバイダーのもの。推論の深さの null は指定しない＝モデルの既定） */
  chat_defaults: ChatOptions;
  /** スマホなど他端末からのアクセスを許可（LAN に公開） */
  remote_enabled: boolean;
  /** ntfy のトピック URL（空なら通知しない） */
  ntfy_url: string;
  /** チャットの完了・失敗・回答待ちを Mac の通知で知らせる */
  desktop_notifications: boolean;
  /** 新規プロジェクトの保存先（前回使ったフォルダ） */
  projects_dir: string;
  /** 通信が切れて止まったチャットを、つながったら自動で再開するか（何度か続かなければ、再開するかを聞く） */
  auto_resume_on_reconnect: boolean;
  /** 完了したチャットを、この日数がたったら自動でアーカイブする（null ならしない） */
  auto_archive_days: number | null;
  /** チャット欄の音声入力（マイクのボタン）を使うか */
  voice_enabled: boolean;
  /** 文字起こしの方法（この Mac / OpenAI） */
  voice_provider: VoiceProvider;
  /** 話す言語（"auto" なら自動で判別。VOICE_LANGUAGES） */
  voice_language: string;
  /** この Mac で使う whisper のモデルの id（voice/models.ts の WHISPER_MODELS） */
  voice_model: string;
  /** OpenAI 互換のサーバーの URL（空なら https://api.openai.com/v1）。API キーは設定とは別に保存し、ここには入れない */
  voice_openai_base_url: string;
  /** OpenAI の文字起こしのモデル */
  voice_openai_model: string;
  /** メモの親フォルダ（この下にプロジェクトごとのフォルダを作る。null なら既定の ~/Documents/kickoff。開発版は kickoff-dev） */
  memos_dir: string | null;
  /** 自動圧縮を始めるコンテキストの使用率（%。null なら Claude Code の既定。Claude Code の CLAUDE_AUTOCOMPACT_PCT_OVERRIDE で渡す） */
  auto_compact_pct: number | null;
  /** 共通の圧縮前指示（会話を圧縮する前に AI に送る指示。プロジェクトの指示があれば、そのあとにつなぐ。null ならなし。@shared/chat/prompts） */
  pre_compact_prompt: string | null;
  /** 共通の圧縮後指示（会話を圧縮したあと、預かっていた指示より先に AI に送る指示。プロジェクトの指示があれば、そのあとにつなぐ。null ならなし） */
  post_compact_prompt: string | null;
  /** 共通の圧縮前指示を送るか（false なら文を残したまま送らない） */
  pre_compact_enabled: boolean;
  /** 共通の圧縮後指示を送るか（false なら文を残したまま送らない） */
  post_compact_enabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  default_provider: "claude",
  chat_defaults: { model: "opus", effort: null, permission_mode: "default", fast_mode: false },
  remote_enabled: false,
  ntfy_url: "",
  desktop_notifications: true,
  projects_dir: "~/Documents",
  auto_archive_days: null,
  auto_resume_on_reconnect: true,
  voice_enabled: false,
  voice_provider: "local",
  voice_language: "ja",
  voice_model: "large-v3-turbo-q5_0",
  voice_openai_base_url: "",
  voice_openai_model: "gpt-4o-transcribe",
  memos_dir: null,
  auto_compact_pct: null,
  pre_compact_prompt: null,
  post_compact_prompt: null,
  pre_compact_enabled: true,
  post_compact_enabled: true,
};
