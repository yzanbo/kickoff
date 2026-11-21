import type { CodexCredits, ExtraUsage, PlanUsage } from "@shared/ai/types";
import type { ProviderId } from "@shared/settings/types";

/**
 * プランの上限を超えたあとの支払いの様子（Claude は追加の使用枠、Codex はクレジット）。
 * 意図せず課金していないかを、下の帯・使用状況の詳細・AI の get_usage で同じ言葉で伝える。
 * - in_use: いま超過分で動いている（使った分を払っている。実行中の rate_limit_event が知らせた）
 * - on: 追加の使用枠がオン（上限を超えると、止まらずに課金されて続く）
 * - off: 追加の使用枠がオフ（上限で止まり、課金されない）
 * - unknown: Claude から追加の使用枠の情報が返っていない
 */
const OVERAGE_STATES = ["in_use", "on", "off", "unknown"] as const;
export type OverageState = (typeof OVERAGE_STATES)[number];

export const OVERAGE_STATE_LABELS: Record<OverageState, string> = {
  in_use: "超過分で課金中",
  on: "追加の使用枠: オン",
  off: "追加の使用枠: オフ",
  unknown: "追加の使用枠: 不明",
};

export const OVERAGE_STATE_HINTS: Record<OverageState, string> = {
  in_use: "プランの使用枠の上限を超え、使った分を払って動いています",
  on: "プランの使用枠の上限を超えると、止まらずに続き、超えた分が課金されます",
  off: "プランの使用枠の上限に達すると止まり、課金されません",
  unknown: "Claude から追加の使用枠の情報が返っていません",
};

/** 超過分の様子（いま超過分で動いている知らせが先。次に追加の使用枠のオン・オフ） */
export function overageStateOf(usage: Pick<PlanUsage, "extra_usage" | "overage"> | undefined): OverageState {
  if (usage?.overage?.in_use) return "in_use";
  if (!usage?.extra_usage) return "unknown";
  return usage.extra_usage.enabled ? "on" : "off";
}

/** 通貨の最小単位の額を、通貨の書き方にする（12345・"USD" → "$123.45"）。通貨が分からなければ記号なしで小数 2 桁 */
export function formatMinorAmount(amount: number, currency: string | null): string {
  if (currency) {
    try {
      const format = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() });
      const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
      return format.format(amount / 10 ** digits);
    } catch {
      // 知らない通貨の符号は、記号なしで出す
    }
  }
  return (amount / 100).toFixed(2);
}

/** この請求期間の超過分の額の 1 行（「今月の超過分 $3.20 / 上限 $50.00（6%）」）。額が分からなければ null */
export function extraUsageSpendText(extra: ExtraUsage): string | null {
  if (extra.used_credits === null) return null;
  const limit = extra.monthly_limit === null ? "" : ` / 上限 ${formatMinorAmount(extra.monthly_limit, extra.currency)}`;
  const pct = extra.utilization === null ? "" : `（${Math.round(extra.utilization)}%）`;
  return `今月の超過分 ${formatMinorAmount(extra.used_credits, extra.currency)}${limit}${pct}`;
}

/** Codex のクレジットの様子の文（様子の分け方は Claude と同じ。in_use = 残りが減った、on = クレジットがある、off = ない） */
export const CODEX_CREDIT_STATE_LABELS: Record<OverageState, string> = {
  in_use: "クレジット使用中",
  on: "クレジット: あり",
  off: "クレジット: なし",
  unknown: "クレジット: 不明",
};

export const CODEX_CREDIT_STATE_HINTS: Record<OverageState, string> = {
  in_use: "プランの使用枠の上限を超え、クレジットから引かれて動いています",
  on: "プランの使用枠の上限を超えると、止まらずにクレジットから引かれて続きます",
  off: "プランの使用枠の上限に達すると止まり、クレジットは引かれません",
  unknown: "Codex からクレジットの情報が返っていません",
};

/** Codex のクレジットの様子（残りが減ったのを見たら in_use。無制限か残りがあれば on、なければ off） */
export function codexCreditStateOf(credits: CodexCredits | null | undefined): OverageState {
  if (!credits) return "unknown";
  if (credits.spending) return "in_use";
  if (credits.unlimited) return "on";
  return credits.has_credits && (credits.balance === null || credits.balance > 0) ? "on" : "off";
}

/** クレジットが減った分の 1 行（「クレジットの残り 150 → 142（8 減りました）」）。減っていなければ null */
export function codexCreditSpendText(credits: CodexCredits): string | null {
  const s = credits.spending;
  return s ? `クレジットの残り ${s.from} → ${s.to}（${roundCredits(s.from - s.to)} 減りました）` : null;
}

/** クレジットの差（小数の引き算の誤差を丸める） */
const roundCredits = (n: number) => Math.round(n * 100) / 100;

/** 実行中に払って動き始めたとき、どの作業から引かれたかが分かるようチャットに残すお知らせ（上限を超えたあとの支払いがある AI ごと） */
export const SPENDING_NOTICES: Partial<Record<ProviderId, string>> = {
  claude: "Claude のプランの使用枠の上限を超えたため、ここから追加の使用枠（使った分の支払い）で動いています",
  codex: "Codex のプランの使用枠の上限を超えたため、ここからクレジットから引かれて動いています",
};
