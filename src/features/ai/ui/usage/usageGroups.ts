import { providerCan } from "@shared/ai/providers";
import type { ProviderStatus } from "@shared/ai/types";
import type { ProviderUsage } from "@shared/ai/usage";
import type { ProviderId } from "@shared/settings/types";
import { paysPerUse, statusOf } from "@/features/ai/ui/provider/providerChoice";

/**
 * 下の帯の右に並べる AI ごとのまとまり（Claude と Codex を同時に出す）。
 * - plan: プランの使用枠の AI（Claude Code。`GET /api/usage?provider=`。5 時間・週・モデル別の週）
 * - service: AI ごとの使用状況（`GET /api/usage`）のその AI の枠
 * - pay: API キーで動かす（使った分の支払い。枠はない）
 * - missing: 前に出しているチャットの AI だが、枠を読めない（読み込み中・取得できない。取得できなかった理由は service に）
 */
export type UsageGroup =
  | { provider: ProviderId; kind: "plan" }
  | { provider: ProviderId; kind: "service"; service: ProviderUsage }
  | { provider: ProviderId; kind: "pay" }
  | { provider: ProviderId; kind: "missing"; service?: ProviderUsage };

/** いつも並べる AI（この順。Claude はいつも、Codex は使っているときだけ） */
const ALWAYS: readonly ProviderId[] = ["claude", "codex"];

/**
 * 並べるまとまりを決める。Claude はいつも出す（サブスクならプランの枠、API キーなら「使った分の支払い」）。
 * ほかの AI は、API キーを置いて API キーで動かすなら「使った分の支払い」、枠を読めれば（status が ok）その枠、
 * どちらでもなければ出さない（ログインしていない AI を並べない）。ただし前に出しているチャットの AI は、枠を読めなくても札だけは出す
 * （いま使っている AI の様子が分からないままにしない）。Claude・Codex 以外の AI も、前に出しているときだけ後ろに足す
 */
export function usageGroups({ foreground, statuses, services }: {
  foreground: ProviderId | null;
  statuses: readonly ProviderStatus[] | undefined;
  services: readonly ProviderUsage[] | undefined;
}): UsageGroup[] {
  const ids = foreground === null || ALWAYS.includes(foreground) ? ALWAYS : [...ALWAYS, foreground];
  return ids.flatMap((provider): UsageGroup[] => {
    const status = statusOf(statuses, provider);
    if (providerCan(provider, "plan_usage")) return [paysPerUse(status) ? { provider, kind: "pay" } : { provider, kind: "plan" }];
    if (paysPerUse(status) && (status?.has_api_key || provider === foreground)) return [{ provider, kind: "pay" }];
    const service = services?.find((s) => s.provider === provider);
    if (service?.status === "ok") return [{ provider, kind: "service", service }];
    return provider === foreground ? [{ provider, kind: "missing", service }] : [];
  });
}
