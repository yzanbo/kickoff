// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { ProviderId } from "./phases.js";

// 外部 CLI（Claude Code など）の状態・コマンド・使用枠
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

/** チャット欄の / で出すコマンド（Claude Code のスラッシュコマンド・スキル） */
export interface SlashCommandOption {
  name: string;
  description: string;
  /** 引数のヒント（"<file>" など。なければ空） */
  argumentHint: string;
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

/** 設定の「使用状況」に並べるサービス */
const USAGE_SERVICE_IDS = ["claude", "codex", "copilot", "cursor", "gemini"] as const;
export type UsageServiceId = (typeof USAGE_SERVICE_IDS)[number];

/**
 * サービスごとの使用状況（設定の「使用状況」）。各サービスのログイン情報を読むだけで、書き換えない。
 * status: ok = 取得できた / unavailable = 見られない（未ログイン・未契約・未インストールなど。message に見る方法） /
 * error = 取得に失敗した（message に理由）
 */
export interface ServiceUsage {
  id: UsageServiceId;
  /** 表示名（"Claude Code" など） */
  label: string;
  status: "ok" | "unavailable" | "error";
  /** 契約プラン（"max"・"plus"・"free" など。わからなければ null） */
  plan: string | null;
  /** ログインしているアカウント（メールアドレス・GitHub のユーザー名。わからなければ null） */
  account: string | null;
  windows: UsageWindow[];
  /** 枠のほかの補足（"クレジット残り 150" など） */
  notes: string[];
  message?: string;
  fetched_at: string;
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
