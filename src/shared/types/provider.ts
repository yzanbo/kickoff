// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { ProviderAuthMode, ProviderId } from "./settings";

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
  /** その AI でできること（ないものは画面で押せない形にして理由を添える。メモの仕様書「0021」の Q4。コアの /api/providers が付ける） */
  features: ProviderFeature[];
  /** ログインの仕方（設定の provider_auth。Q13。コアの /api/providers が付ける） */
  auth_mode?: ProviderAuthMode;
  /** API キーを置いたか（キーそのものは出さない） */
  has_api_key?: boolean;
  /** CLI の版（分からなければ null・省く）。bundled なら Kickoff に同梱した版（Claude Code。上げるのは Kickoff の開発の側） */
  version?: string | null;
  bundled?: boolean;
  /** 利用者が入れた CLI に新しい版が出ていれば、その版と上げ方（自分で上げられるものだけ。いまは Codex） */
  update?: ProviderUpdate | null;
}

/** 各 AI の CLI が返す状態（API の応答 ProviderStatus は、これにコアの /api/providers ができること features を足したもの） */
export type ProviderCliStatus = Omit<ProviderStatus, "features">;

/** 入れた CLI の新しい版と上げ方 */
export interface ProviderUpdate {
  latest: string;
  /** 上げるコマンド（ターミナルで流す） */
  command: string;
  /** 入れ方の名前（Homebrew の cask・npm） */
  source: string;
}

/** AI によってできたりできなかったりすること（プロバイダーが対応するものだけを持つ） */
export const PROVIDER_FEATURES = ["fork", "rewind_files", "subagent_log", "usage", "commands", "models", "summarize", "login"] as const;
export type ProviderFeature = (typeof PROVIDER_FEATURES)[number];

/** できることの名前（押せない理由の文に使う） */
const PROVIDER_FEATURE_LABELS: Record<ProviderFeature, string> = {
  fork: "分岐・巻き戻し",
  rewind_files: "ファイルを戻す",
  subagent_log: "サブエージェントの会話の記録",
  usage: "使用枠の表示",
  commands: "/ のコマンド",
  models: "モデルの選択",
  summarize: "AI で要約",
  login: "ブラウザでログイン",
};

/** できないことの理由の文（「Codex のチャットでは分岐・巻き戻しは使えません」） */
export const providerFeatureMissing = (label: string, feature: ProviderFeature) => `${label} のチャットでは${PROVIDER_FEATURE_LABELS[feature]}は使えません`;

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

/** 設定の「使用状況」に並べるサービス（AI と同じ） */
export type UsageServiceId = ProviderId;

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
  /** 契約プラン（"Ultra"・"Max 20x"（Claude はアカウントの表示名）・"max"・"plus"・"free" など。わからなければ null） */
  plan: string | null;
  /** ログインしているアカウント（メールアドレス・GitHub のユーザー名。わからなければ null） */
  account: string | null;
  windows: UsageWindow[];
  /** 枠のほかの補足（"クレジット残り 150" など） */
  notes: string[];
  /** Codex のクレジット（プランの上限を超えたあと、買ったクレジットから引いて続ける）。Codex 以外・分からなければ null */
  credits?: CodexCredits | null;
  message?: string;
  fetched_at: string;
}

/** Codex のクレジットの様子 */
export interface CodexCredits {
  /** クレジットを持っているか（なければ、プランの上限で止まり、引かれない） */
  has_credits: boolean;
  /** 無制限か */
  unlimited: boolean;
  /** 残り。分からなければ null */
  balance: number | null;
  /** 残りが減ったのを見た（いまクレジットから引かれている。from → to は見た残り）。上限に達した枠がなくなったら外す */
  spending: { since: string; from: number; to: number } | null;
}

/** 追加の使用枠の様子（金額は currency の最小単位。USD ならセント） */
export interface ExtraUsage {
  /** オンか（オフなら、プランの上限で止まり、課金されない） */
  enabled: boolean;
  /** 月の上限に対して使った割合（%）。分からなければ null */
  utilization: number | null;
  /** この請求期間に超過分で使った額。分からなければ null */
  used_credits: number | null;
  /** 月の上限の額。決めていなければ null */
  monthly_limit: number | null;
  /** 通貨（"USD" など）。分からなければ null */
  currency: string | null;
}

/** 超過分で動いているかの知らせ（実行中の rate_limit_event から） */
export interface OverageNote {
  in_use: boolean;
  /** 知らされた時刻 */
  observed_at: string;
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
  /** 追加の使用枠（extra usage。プランの上限を超えたあと、使った分を払って続ける）。わからなければ null */
  extra_usage?: ExtraUsage | null;
  /** いま超過分で動いているか（Claude Code が実行中に知らせた最後の値。まだ知らされていなければ null） */
  overage?: OverageNote | null;
  fetched_at: string;
  error?: string;
}

/** ファイルを戻した結果（canRewind: 戻せる・戻せたか。filesChanged: 変わるファイル。insertions / deletions: 行の増減） */
export interface FileRewindResult {
  can_rewind: boolean;
  error?: string;
  files_changed?: string[];
  insertions?: number;
  deletions?: number;
}
