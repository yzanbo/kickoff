// 使用状況の前の形（PlanUsage・ServiceUsage・CodexCredits）への写し。画面とその API・SSE が ProviderUsage に乗せ替えたら消す
import { providerCan } from "./providers";
import type { CodexCredits, PlanUsage, ServiceUsage, UsageWindow } from "./types";
import type { PayAsYouGo, ProviderUsage } from "./usage";
import type { ProviderId } from "@shared/settings/types";

/** 前の形の名前（サービスの使用状況の表示名。Gemini は Gemini CLI の枠） */
const SERVICE_LABELS: Record<ProviderId, string> = { claude: "Claude Code", codex: "Codex", copilot: "GitHub Copilot", cursor: "Cursor", gemini: "Gemini" };
/** 前の形のプランの使用枠の名前（Claude） */
const PLAN_LABELS: Partial<Record<ProviderId, string>> = { claude: "Claude" };

const emptyWindow = (key: string, label: string): UsageWindow => ({ key, label, utilization: null, resets_at: null });

/** プランの使用枠の前の形（下の帯の Claude。5 時間・週・モデル別の週と、追加の使用枠・超過分で動いているか） */
export function toPlanUsage(u: ProviderUsage): PlanUsage {
  const p = u.pay_as_you_go;
  const error = u.error ?? (u.status === "error" ? u.message : undefined);
  return {
    provider: u.provider,
    provider_label: PLAN_LABELS[u.provider] ?? SERVICE_LABELS[u.provider],
    available: u.status === "ok",
    plan: u.plan,
    five_hour: u.windows.find((w) => w.key === "five_hour") ?? emptyWindow("five_hour", "5時間"),
    seven_day: u.windows.find((w) => w.key === "seven_day") ?? emptyWindow("seven_day", "週"),
    model_weekly: u.windows.filter((w) => w.key.startsWith("model:")),
    extra_usage: p && p.enabled !== null ? { enabled: p.enabled, utilization: p.utilization, used_credits: p.used, monthly_limit: p.limit, currency: p.currency } : null,
    overage: p?.checked_at ? { in_use: p.spending !== null, observed_at: p.checked_at } : null,
    fetched_at: u.fetched_at,
    ...(error !== undefined ? { error } : {}),
  };
}

/** クレジットの前の形（Codex。分からなければ null） */
export function toCodexCredits(p: PayAsYouGo | null): CodexCredits | null {
  if (!p) return null;
  const s = p.spending;
  return { has_credits: p.enabled ?? false, unlimited: p.unlimited, balance: p.balance, spending: s ? { since: s.since, from: s.from ?? 0, to: s.to ?? 0 } : null };
}

/** サービスの使用状況の前の形（設定の「使用状況」） */
export function toServiceUsage(u: ProviderUsage): ServiceUsage {
  const base = { id: u.provider, label: SERVICE_LABELS[u.provider], plan: u.plan, account: u.account, windows: u.windows, notes: u.notes };
  // プランの使用枠の AI（Claude）は、下の帯と同じ値を写す。最新の取得に失敗しても直前の値は出し、理由を添える
  if (providerCan(u.provider, "plan_usage")) {
    const plan = toPlanUsage(u);
    if (!plan.available) {
      const message = plan.error ?? "Claude のプランの使用枠を取得できませんでした（API キーで使っている場合は枠がありません）";
      return { ...base, plan: plan.error ? plan.plan : null, account: null, windows: [], notes: [], status: plan.error ? "error" : "unavailable", message, fetched_at: u.fetched_at };
    }
    return { ...base, account: null, notes: [], status: "ok", ...(plan.error ? { message: `最新の取得に失敗: ${plan.error}` } : {}), fetched_at: u.fetched_at };
  }
  // クレジットで払う AI（Codex）だけが credits の欄を持つ
  const credits = providerCan(u.provider, "pay_as_you_go") ? { credits: toCodexCredits(u.pay_as_you_go) } : {};
  return { ...base, status: u.status, ...credits, ...(u.message !== undefined ? { message: u.message } : {}), fetched_at: u.fetched_at };
}
