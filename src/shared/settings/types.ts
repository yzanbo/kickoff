// プロバイダー・推論の深さ・権限モードなど、設定の項目の値の一覧（設定の項目と既定は各機能の src/shared/<機能>/settings.ts。束ねは src/app/shared/settings.ts）

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

/** 共通のチャットの AI がほかのプロジェクトに書くとき（チャットを作って頼む・チャットの名前 / 固定 / グループを変える・ノートを書く / 移す・自分を移す）の扱い: 毎回聞く / 聞かずに書く / 書かせない */
export const AI_WRITE_OTHER_PROJECTS_MODES = ["ask", "allow", "off"] as const;
export type AiWriteOtherProjectsMode = (typeof AI_WRITE_OTHER_PROJECTS_MODES)[number];

export const AI_WRITE_OTHER_PROJECTS_MODE_LABELS: Record<AiWriteOtherProjectsMode, string> = {
  ask: "毎回聞く",
  allow: "聞かずに書く",
  off: "書かせない",
};

/** 返答などの Markdown のリンクを開く先: kickoff = Kickoff のブラウザのタブ / browser = 既定のブラウザ。⌘ を押しながらだと反対の方で開く */
export const LINK_OPEN_TARGETS = ["kickoff", "browser"] as const;
export type LinkOpenTarget = (typeof LINK_OPEN_TARGETS)[number];
export const LINK_OPEN_TARGET_LABELS: Record<LinkOpenTarget, string> = { kickoff: "Kickoff のブラウザ", browser: "既定のブラウザ" };

/** 「今後確認しない」にできるドメインの数の上限（設定の一覧が長くなりすぎないように） */
export const TRUSTED_LINK_DOMAINS_MAX = 500;

/** Claude Code のほかの AI の既定の初め（モデル・推論の深さはその AI の既定に任せ、権限モードは毎回確認） */
/** 実行ごとに選べるオプション（チャット欄の選択） */
export interface ChatOptions {
  /** モデル（null ならプロバイダーの既定） */
  model: string | null;
  /** 推論の深さ（null なら指定しない＝モデルの既定） */
  effort: EffortLevel | null;
  permission_mode: PermissionMode;
  fast_mode: boolean;
}

/** 選択の一部（送るとき・送信待ち・プロジェクトの既定）。書いていない項目は、次の段（送るとき → プロジェクト → アプリ）に従う */
export type ChatOptionsPatch = Partial<ChatOptions>;

export const PROVIDER_BASE_CHAT_OPTIONS: ChatOptions = { model: null, effort: null, permission_mode: "default", fast_mode: false };
