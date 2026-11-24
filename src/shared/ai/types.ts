import type { EffortLevel, ProviderAuthMode, ProviderId } from "@shared/settings/types";
import type { ProviderCapability } from "./providers";

// 外部 CLI（Claude Code など）の状態・コマンド・使用枠
export interface ProviderStatus {
  id: ProviderId;
  label: string;
  implemented: boolean;
  installed: boolean;
  logged_in: boolean;
  account?: string;
  plan?: string;
  detail: string;
  /** できること（AI ごとの表 @shared/ai/providers。本物の実装でなければ空。ないものは画面で押せない形にして理由を添える。コアの /api/providers が付ける） */
  capabilities: ProviderCapability[];
  /** ログインの仕方（設定の provider_auth。コアの /api/providers が付ける） */
  auth_mode?: ProviderAuthMode;
  /** API キーを置いたか（キーそのものは出さない） */
  has_api_key?: boolean;
  /** CLI の版（分からなければ null・省く）。bundled なら Kickoff に同梱した版（Claude Code。上げるのは Kickoff の開発の側） */
  version?: string | null;
  bundled?: boolean;
  /** 利用者が入れた CLI に新しい版が出ていれば、その版と上げ方（自分で上げられるものだけ。いまは Codex） */
  update?: ProviderUpdate | null;
}

/** 各 AI の CLI が返す状態（API の応答 ProviderStatus は、これにコアの /api/providers ができること capabilities を足したもの） */
export type ProviderCliStatus = Omit<ProviderStatus, "capabilities">;

/** 入れた CLI の新しい版と上げ方 */
export interface ProviderUpdate {
  latest: string;
  /** 上げるコマンド（ターミナルで流す） */
  command: string;
  /** 入れ方の名前（Homebrew の cask・npm） */
  source: string;
}

/** できないときに押せない理由を出す「できること」と、その名前（理由の文に使う） */
const CAPABILITY_LABELS = {
  fork: "分岐・巻き戻し",
  rewind_files: "ファイルを戻す",
  subagent_log: "サブエージェントの会話の記録",
  commands: "/ のコマンド",
  models: "モデルの選択",
  login: "ブラウザでログイン",
} as const satisfies Partial<Record<ProviderCapability, string>>;
export type BlockableCapability = keyof typeof CAPABILITY_LABELS;

/** できないことの理由の文（「Codex のチャットでは分岐・巻き戻しは使えません」） */
export const providerFeatureMissing = (label: string, capability: BlockableCapability) => `${label} のチャットでは${CAPABILITY_LABELS[capability]}は使えません`;

/** チャット欄の / で出すコマンド（Claude Code のスラッシュコマンド・スキル） */
export interface SlashCommandOption {
  name: string;
  description: string;
  /** 引数のヒント（"<file>" など。なければ空） */
  argument_hint: string;
}

/** サブスクリプションの使用枠（5 時間・週など）の 1 区分 */
export interface UsageWindow {
  key: string;
  label: string;
  /** 使用率 0〜100。枠が始まっていなければ null */
  utilization: number | null;
  resets_at: string | null;
  /** 使った量の補足（"120 / 300 回"・"$3.20 / $20.00" など。率だけのサービスはなし） */
  detail?: string;
}

/** ファイルを戻した結果（can_rewind: 戻せる・戻せたか。files_changed: 変わるファイル。insertions / deletions: 行の増減） */
export interface FileRewindResult {
  can_rewind: boolean;
  error?: string;
  files_changed?: string[];
  insertions?: number;
  deletions?: number;
}

/** ブラウザでのログインの終わり方（SSE の provider_login） */
const PROVIDER_LOGIN_STATUSES = ["completed", "failed", "cancelled"] as const;
export type ProviderLoginStatus = (typeof PROVIDER_LOGIN_STATUSES)[number];

/** チャット欄で選べるモデル */
export interface ModelOption {
  value: string;
  /** 別名（opus など）が指すモデルの ID（claude-opus-5-5 など。分からなければなし） */
  resolved_model?: string;
  label: string;
  description: string;
  efforts: EffortLevel[];
  /** モデル一覧が知らせる既定の推論の深さ。設定による上書きや今回の実行値とは限らない */
  default_effort?: string;
  supports_auto_mode: boolean;
  /** モデルの対応状況。null はプロバイダーが通知しなかった場合 */
  supports_fast_mode: boolean | null;
  /** その AI の既定のモデル（Codex の一覧の isDefault。チャット欄でモデルを決めていないときに選んで見せる。分からなければなし） */
  is_default?: boolean;
}

/**
 * 推論の深さを指定しないとき（既定）に Claude Code が使う深さ。effort が null ならモデルの既定（値は分からない）。
 * source はどこで決まったか（env = 環境変数 / local・project = 作業フォルダの .claude / user = ~/.claude）
 */
export interface EffortDefault {
  effort: EffortLevel | null;
  source: "env" | "local" | "project" | "user" | null;
}

// ---- HTTP API の本文と応答（コアのルートと画面で同じものを使う） ----

/** AI のブラウザでのログインを始めた答え（POST /api/providers/:id/login。画面は auth_url を既定のブラウザで開き、provider_login の知らせを待つ） */
export interface ProviderLoginStart {
  auth_url: string;
}
