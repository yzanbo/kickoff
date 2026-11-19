// プロバイダー・推論の深さ・権限モードの定数と、アプリ全体の設定
import type { ChatOptions } from "@shared/chat/types";
import type { VoiceProvider, VoiceTtsProvider } from "@shared/voice/types";

export const PROVIDER_IDS = ["claude", "codex", "copilot", "cursor", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
/** Claude Code のほかの AI（既定の選択を Claude Code と分けて持つ） */
export type OtherProviderId = Exclude<ProviderId, "claude">;
export const OTHER_PROVIDER_IDS = PROVIDER_IDS.filter((id): id is OtherProviderId => id !== "claude");

/** AI のログインの仕方: subscription = 定額のプラン（各 CLI のログイン・Codex は Sign in with ChatGPT）/ api_key = API キー（使った分の支払い） */
export const PROVIDER_AUTH_MODES = ["subscription", "api_key"] as const;
export type ProviderAuthMode = (typeof PROVIDER_AUTH_MODES)[number];
export const PROVIDER_AUTH_MODE_LABELS: Record<ProviderAuthMode, string> = { subscription: "サブスク", api_key: "API キー" };

/** AI の名前（画面・承認カード・AI に返す文） */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
  gemini: "Gemini（Antigravity）",
};

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

/** チャットの AI がチャット（子・兄弟・親のないチャット）を作るツール（kickoff_chat の create_chat）の扱い: 毎回聞く / 聞かずに作る / 作らせない（ツールを渡さない） */
export const AI_CREATE_CHAT_MODES = ["ask", "allow", "off"] as const;
export type AiCreateChatMode = (typeof AI_CREATE_CHAT_MODES)[number];

export const AI_CREATE_CHAT_MODE_LABELS: Record<AiCreateChatMode, string> = {
  ask: "毎回聞く",
  allow: "聞かずに作る",
  off: "作らせない",
};

/** 返答などの Markdown のリンクを開く先: kickoff = Kickoff のブラウザのタブ / browser = 既定のブラウザ。⌘ を押しながらだと反対の方で開く */
export const LINK_OPEN_TARGETS = ["kickoff", "browser"] as const;
export type LinkOpenTarget = (typeof LINK_OPEN_TARGETS)[number];
export const LINK_OPEN_TARGET_LABELS: Record<LinkOpenTarget, string> = { kickoff: "Kickoff のブラウザ", browser: "既定のブラウザ" };

/** 「今後確認しない」にできるドメインの数の上限（設定の一覧が長くなりすぎないように） */
export const TRUSTED_LINK_DOMAINS_MAX = 500;

export interface AppSettings {
  /** 新規プロジェクトの既定プロバイダー */
  default_provider: ProviderId;
  /** AI ごとのログインの仕方（書いていない AI はサブスク。API キーそのものは secrets に暗号化して置き、ここには出さない） */
  provider_auth: Partial<Record<ProviderId, ProviderAuthMode>>;
  /** 新しい Claude Code のチャットの既定の選択（推論の深さの null は指定しない＝モデルの既定） */
  chat_defaults: ChatOptions;
  /** Claude Code のほかの AI の新しいチャットの既定の選択（書いていない AI は、モデル・深さはその AI の既定・毎回確認。モデルの null はその AI の既定） */
  provider_chat_defaults: Partial<Record<OtherProviderId, ChatOptions>>;
  /** 新しいチャットでコマンドの砂場を使う既定（既存のチャットは変えない） */
  sandbox_enabled_by_default: boolean;
  /** 新しいチャットで Kickoff の編集先の制限を使う既定（既存のチャットは変えない） */
  edit_scope_enabled_by_default: boolean;
  /**
   * スマホ連携のオン・オフ（スマホからつなぐ）。オンのときだけ、端末の登録（ペアリング）を受け付け、つないだ端末からの頼みを受け、
   * 電源につないでいる間は本体を眠らせない。待ち受けは 127.0.0.1 のまま（外からは Tailscale Serve などを通す）。オフでも、つないだ端末の登録は残す
   */
  remote_enabled: boolean;
  /** スマホ連携で端末がつなぐ先の URL（Tailscale Serve の https://<Mac の名前>.ts.net など。ペアリングの QR に入れる。null なら QR を出さず番号だけ） */
  mobile_url: string | null;
  /** チャットの完了・失敗・回答待ちを Mac の通知で知らせる */
  desktop_notifications: boolean;
  /** Dock の Kickoff のアイコンに、要対応（回答待ち・未読）のチャットの数を赤い数字で出す */
  dock_badge: boolean;
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
  /** 音声モードで返答を読み上げる方法（この Mac の声 / OpenAI の声） */
  voice_tts_provider: VoiceTtsProvider;
  /** この Mac の声の名前（空なら話す言語の既定の声） */
  voice_tts_voice: string;
  /** OpenAI の声（OPENAI_TTS_VOICES） */
  voice_tts_openai_voice: string;
  /** 読み上げの速さ（1 が標準。VOICE_TTS_RATE_MIN〜MAX） */
  voice_tts_rate: number;
  /** ノートの親フォルダ（この下にプロジェクトごとのフォルダを作る。null なら既定の ~/Documents/kickoff。開発版は kickoff-dev） */
  notes_dir: string | null;
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
  /** チャットの AI がチャット（子・兄弟・親のないチャット）を作るとき（承認カードの「常に許可」で allow になる。権限モードによらない） */
  ai_create_chat: AiCreateChatMode;
  /** Markdown のリンクを開く先（既定は Kickoff のブラウザ） */
  link_open_in: LinkOpenTarget;
  /** 外部リンクを開く前の確認で「今後確認しない」にしたドメイン（小文字。アプリ全体で使う。警告に当たるリンクはこの一覧にあっても確かめる） */
  trusted_link_domains: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  default_provider: "claude",
  provider_auth: {},
  chat_defaults: { model: "opus", effort: null, permission_mode: "default", fast_mode: false },
  provider_chat_defaults: {},
  sandbox_enabled_by_default: true,
  edit_scope_enabled_by_default: true,
  remote_enabled: false,
  mobile_url: null,
  desktop_notifications: true,
  dock_badge: true,
  projects_dir: "~/Documents",
  auto_archive_days: null,
  auto_resume_on_reconnect: true,
  voice_enabled: false,
  voice_provider: "local",
  voice_language: "ja",
  voice_model: "large-v3-turbo-q5_0",
  voice_openai_base_url: "",
  voice_openai_model: "gpt-4o-transcribe",
  voice_tts_provider: "system",
  voice_tts_voice: "",
  voice_tts_openai_voice: "coral",
  voice_tts_rate: 1,
  notes_dir: null,
  auto_compact_pct: null,
  pre_compact_prompt: null,
  post_compact_prompt: null,
  pre_compact_enabled: true,
  post_compact_enabled: true,
  ai_create_chat: "ask",
  link_open_in: "kickoff",
  trusted_link_domains: [],
};
