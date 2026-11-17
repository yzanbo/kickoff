import { useEffect } from "react";
import type { ProviderId, ServiceUsage } from "@shared/types";
import { api } from "@/api";
import { createStore } from "@/stores/createStore";
import { useStore } from "@/stores/useStore";
import { PAY_PER_USE_LABEL, paysPerUse, providerLabel } from "@/features/chat/provider/providerChoice";
import { useForegroundProvider, useProviderStatus } from "@/features/chat/provider/chatProvider";
import { planLabel } from "./usage";
import { UsageMeter } from "./UsageMeter";
import { useAction } from "@/hooks/useAction";
import { usePopover } from "@/ui/Popover";
import { ServiceUsagePopover } from "./ServiceUsagePopover";

const POLL_MS = 5 * 60_000;

/** サービスごとの使用状況（下の帯と詳細で共有する。Claude Code 以外のチャットを前に出したときだけ読む） */
const serviceUsageStore = createStore<ServiceUsage[]>({ load: () => api.usageServices(), maxAge: POLL_MS });

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

/** 前に出しているチャットの AI の使用状況（帯の右。メーターを押すと Claude Code と同じく上に詳細を開く） */
export function ForegroundUsage({ provider }: { provider: ProviderId }) {
  const status = useProviderStatus(provider);
  const pays = paysPerUse(status);
  const usage = useStore(serviceUsageStore, { active: !pays });
  const { anchor, ...detail } = usePopover();
  const action = useAction<"refresh">();
  const label = providerLabel(provider, status);
  // 開いている間は取り直す。更新後は下の帯の数値も同じ店から直る。
  useEffect(() => {
    if (!detail.open || pays) return;
    serviceUsageStore.ensure();
    const timer = setInterval(() => void serviceUsageStore.reload().catch(() => {}), POLL_MS);
    return () => clearInterval(timer);
  }, [detail.open, pays]);
  const refresh = () => action.run("refresh", async () => serviceUsageStore.set(await api.refreshUsageServices()));
  if (pays) {
    return (
      <span className="plan-chip" title={`前に出しているチャットの AI（${label}）は API キーで動かします。使った分だけ支払います`}>
        {label} · {PAY_PER_USE_LABEL}
      </span>
    );
  }
  const service = usage.data?.find((s) => s.id === provider);
  // 更新で利用できなくなっても、開いている詳細には理由を残す。
  if (!service || (service.status !== "ok" && !detail.open)) return null;
  return (
    <>
      {service.plan && (
        <span className="plan-chip" title={`前に出しているチャットの AI（${label}）でログインしているアカウントの契約プラン`}>
          {label} {planLabel(service.plan)}
        </span>
      )}
      {(service.windows.length > 0 || detail.open) && (
        <button
          type="button"
          ref={anchor}
          className={`footer-usage ${detail.open ? "active" : ""}`}
          title={`${label} の使用状況の詳細`}
          aria-label={`${label} の使用状況の詳細`}
          aria-haspopup="dialog"
          aria-expanded={detail.open}
          onClick={detail.toggle}
        >
          {service.windows.length > 0 ? service.windows.map((w) => (
            <UsageMeter key={w.key} window={w} inline />
          )) : `${label} の使用状況`}
        </button>
      )}
      {detail.open && (
        <ServiceUsagePopover
          anchor={anchor}
          service={service}
          refreshing={action.busy !== null || usage.loading}
          error={action.error ?? usage.error}
          onRefresh={() => void refresh()}
          onClose={detail.close}
        />
      )}
    </>
  );
}
