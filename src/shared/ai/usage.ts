// AI ごとの使用状況の形（プランの使用枠も、サービスごとの使用状況も同じ形。画面が乗せ替えるまでは usageCompat.ts で前の形に写す）
import type { ProviderId } from "@shared/settings/types";
import type { UsageWindow } from "./types";

/**
 * 1 つの AI の使用状況。各 AI のログイン情報を読むだけで、書き換えない。
 * status: ok = 取得できた / unavailable = 見られない（未ログイン・未契約・API キーで使っているなど。message に見る方法） /
 * error = 取得に失敗した（message に理由）
 */
export interface ProviderUsage {
  provider: ProviderId;
  status: "ok" | "unavailable" | "error";
  /** 契約プラン（Claude はアカウントの表示名 "Ultra"・"Max 20x" など。分からなければ null） */
  plan: string | null;
  /** ログインしているアカウント（メールアドレス・GitHub のユーザー名。分からなければ null） */
  account: string | null;
  /** 枠（key: five_hour・seven_day・model:<名前>・primary・premium_interactions・total など） */
  windows: UsageWindow[];
  /** 枠のほかの補足（"クレジット残り 150" など） */
  notes: string[];
  /** 上限を超えたあとの支払い（Claude の追加の使用枠・Codex のクレジット）。分からなければ null */
  pay_as_you_go: PayAsYouGo | null;
  message?: string;
  /** 最新の取得に失敗した理由（前の値を残して添える。status は前の値のまま） */
  error?: string;
  fetched_at: string;
}

/** 上限を超えたあとの支払いの様子（金額は通貨の最小単位。USD ならセント） */
export interface PayAsYouGo {
  /** 上限を超えても払って続くか（追加の使用枠がオン・クレジットがある）。分からなければ null */
  enabled: boolean | null;
  unlimited: boolean;
  /** クレジットの残り。分からなければ null */
  balance: number | null;
  /** 月の上限に対して使った割合（%）・この請求期間に使った額・月の上限の額・通貨。分からなければ null */
  utilization: number | null;
  used: number | null;
  limit: number | null;
  currency: string | null;
  /** いまそこから引かれているか（始まった時刻。クレジットは見た残りの from → to も）。引かれていなければ null */
  spending: { since: string; from?: number; to?: number } | null;
  /** 引かれているかを実行中の知らせ・取得で最後に確かめた時刻（まだなら null） */
  checked_at: string | null;
}

/** 上限に達した枠があるか（使用率の一覧から。枠が 1 つもなければ分からない = null） */
export function limitReachedOf(percents: readonly (number | null)[]): boolean | null {
  const known = percents.filter((p): p is number => p !== null);
  return known.length === 0 ? null : known.some((p) => p >= 100);
}

/** 使い切った枠（使用率 100%）のうち、いちばん遅く戻る時刻（AI が時刻を知らせなかったときに使う。取れていない・なければ null） */
export function exhaustedResetOf(usage: ProviderUsage): string | null {
  if (usage.status !== "ok") return null;
  const times = usage.windows.filter((w) => (w.utilization ?? 0) >= 100 && w.resets_at).map((w) => w.resets_at!);
  return times.length ? times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)) : null;
}

/**
 * 実行中に AI が知らせた支払いの様子（分からない項目は null か省く = 前の値のまま）。
 * Claude は超過分で動いているか（in_use）、Codex はクレジット（has_credits・unlimited・balance と、上限に達した枠があるか limit_reached）
 */
export interface SpendingNote {
  in_use?: boolean | null;
  has_credits?: boolean | null;
  unlimited?: boolean | null;
  balance?: number | null;
  limit_reached?: boolean | null;
}
