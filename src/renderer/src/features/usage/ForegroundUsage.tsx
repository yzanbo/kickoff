import type { ProviderId, ServiceUsage } from "@shared/types";
import { api } from "@/api";
import { createStore } from "@/stores/createStore";
import { useStore } from "@/stores/useStore";
import { PAY_PER_USE_LABEL, paysPerUse, providerLabel } from "@/features/chat/provider/providerChoice";
import { useForegroundProvider, useProviderStatus } from "@/features/chat/provider/chatProvider";
import { planLabel } from "./usage";
import { UsageMeter } from "./UsageMeter";

/** サービスごとの使用状況（下の帯で Claude Code 以外のチャットを前に出したときだけ読む。5 分は取り直さない） */
const serviceUsageStore = createStore<ServiceUsage[]>({ load: () => api.usageServices(), maxAge: 5 * 60_000 });

/**
 * 下の帯の使用状況に、前に出しているチャットの AI のものを出すか（メモの仕様書「0021」の Q6 B）。
 * Claude Code をサブスクで使うチャット（と、まだチャットを開いていないとき）は null を返し、帯はいまのプランの使用枠を出す。
 * API キーで動かす AI は「使った分の支払い」の札、ほかの AI はその AI の枠（見られなければ何も出さない）
 */
export function useForegroundUsage(): ProviderId | null {
  const provider = useForegroundProvider();
  const status = useProviderStatus(provider ?? "claude");
  if (provider === null) return null;
  return provider === "claude" && !paysPerUse(status) ? null : provider;
}

/** 前に出しているチャットの AI の使用状況（帯の右。押しても何も開かない。詳しくは設定の「使用状況」） */
export function ForegroundUsage({ provider }: { provider: ProviderId }) {
  const status = useProviderStatus(provider);
  const pays = paysPerUse(status);
  const services = useStore(serviceUsageStore, { active: !pays }).data;
  const label = providerLabel(provider, status);
  if (pays) {
    return (
      <span className="plan-chip" title={`前に出しているチャットの AI（${label}）は API キーで動かします。使った分だけ支払います`}>
        {label} · {PAY_PER_USE_LABEL}
      </span>
    );
  }
  const service = services?.find((s) => s.id === provider);
  if (!service || service.status !== "ok") return null;
  return (
    <>
      {service.plan && (
        <span className="plan-chip" title={`前に出しているチャットの AI（${label}）でログインしているアカウントの契約プラン`}>
          {label} {planLabel(service.plan)}
        </span>
      )}
      {service.windows.length > 0 && (
        <span className="footer-usage" title={`${label} の使用状況（詳しくは設定の「使用状況」）`}>
          {service.windows.map((w) => (
            <UsageMeter key={w.key} window={w} inline />
          ))}
        </span>
      )}
    </>
  );
}
