import { providerCan, PROVIDERS } from "@shared/ai/providers";
import { paysByCredits, usageErrorOf, type ProviderUsage } from "@shared/ai/usage";
import { PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";
import { formatClock } from "@/foundation/ui/lib/time";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { StatusDot, toneOf } from "@/foundation/ui/kit/StatusDot";
import { PLANNED_BADGE } from "@/features/ai/ui/provider/plannedProviders";
import { SpendState } from "./SpendState";
import { FIVE_HOUR_IDLE, planLabel } from "./usage";
import { UsageFetchedNote } from "./UsageFetchedNote";
import { UsageMeter } from "./UsageMeter";

interface Props {
  service: ProviderUsage;
  /** popover = 下の帯の詳細の中身（既定）、panel = 設定の「使用状況」のサービスの 1 まとまり */
  variant?: "popover" | "panel";
  /** 取り直しの失敗（popover だけ。更新に失敗しても直前の枠は残す） */
  error?: string;
  /** Kickoff のチャットで使うのは今後の対応予定の AI（panel だけ） */
  planned?: boolean;
}

/** 使用状況の名前（Gemini は Gemini CLI の枠なので、AI の名前と違う） */
const USAGE_LABELS: Record<ProviderId, string> = { ...PROVIDER_LABELS, gemini: "Gemini" };

/** サービスごとの使用状況（枠・アカウント・クレジットの様子（Codex）・補足と、取得できない理由。取り直しに失敗しても直前の枠は残す） */
export function ServiceUsageDetails({ service, variant = "popover", error, planned = false }: Props) {
  return variant === "panel" ? <ServicePanel service={service} planned={planned} /> : <ServicePopover service={service} error={error} />;
}

/** 下の帯の詳細の中身（プランの使用枠の AI は PlanUsageDetails） */
function ServicePopover({ service, error }: { service: ProviderUsage; error?: string }) {
  const credits = paysByCredits(service.provider) ? service.pay_as_you_go : null;
  return (
    <div className="usage-popover-body">
      {service.account && <p className="muted small usage-popover-foot">{service.account}</p>}
      {service.status === "ok" && (
        service.windows.length > 0 ? service.windows.map((window) => (
          <UsageMeter key={window.key} window={window} />
        )) : <p className="muted small usage-popover-foot">使用枠の情報はありません</p>
      )}
      {service.status === "ok" && credits && <SpendState kind="credits" pay={credits} />}
      {service.notes.length > 0 && <p className="muted small usage-popover-foot">{service.notes.join(" ・ ")}</p>}
      {service.message && (service.status === "error"
        ? <ErrorText message={service.message} />
        : <p className="muted small usage-popover-foot">{service.message}</p>)}
      <ErrorText message={error} />
      <UsageFetchedNote usage={service} className="usage-popover-foot" />
    </div>
  );
}

/**
 * 設定の「使用状況」に出す様子。プランの使用枠の AI（Claude）は下の帯と同じ値を出し（アカウント・補足は出さない）、
 * 取れなければ理由を、最新の取得に失敗したら直前の値に理由を添える
 */
function panelView(u: ProviderUsage): Pick<ProviderUsage, "status" | "plan" | "account" | "windows" | "notes" | "message"> {
  if (!providerCan(u.provider, "plan_usage")) return u;
  const error = usageErrorOf(u);
  if (u.status !== "ok") {
    const message = error ?? `${PROVIDERS[u.provider].short ?? USAGE_LABELS[u.provider]} のプランの使用枠を取得できませんでした（API キーで使っている場合は枠がありません）`;
    return { status: error ? "error" : "unavailable", plan: error ? u.plan : null, account: null, windows: [], notes: [], message };
  }
  return { status: "ok", plan: u.plan, account: null, windows: u.windows, notes: [], ...(error ? { message: `最新の取得に失敗: ${error}` } : {}) };
}

/** 設定の「使用状況」の 1 つのサービス: 名前・プラン・アカウントと、枠のメーター（見られなければ理由） */
function ServicePanel({ service, planned }: { service: ProviderUsage; planned: boolean }) {
  const s = panelView(service);
  // 5 時間の枠がまだ始まっていない文は、プランの使用枠の AI（Claude）だけ
  const fiveHourIdle = providerCan(service.provider, "plan_usage") ? FIVE_HOUR_IDLE : undefined;
  const label = USAGE_LABELS[service.provider];
  return (
    <div className="usage-service">
      <div className="usage-service-head">
        <StatusDot tone={toneOf(s.status === "ok" ? true : s.status === "error" ? false : null)} />
        <h3>{label}</h3>
        {planned && <span className="badge">{PLANNED_BADGE}</span>}
        {s.plan && <span className="plan-chip tag" data-look="outline">{planLabel(s.plan)}</span>}
        {s.account && <span className="muted small usage-service-account">{s.account}</span>}
        {s.status === "ok" && <span className="muted small usage-service-time">{formatClock(service.fetched_at)} 時点</span>}
      </div>
      {s.status === "ok" && s.windows.length > 0 && (
        <div className="card-grid">
          {s.windows.map((w) => (
            <div className="card" key={w.key}>
              <UsageMeter window={w} idleText={w.key === "five_hour" ? fiveHourIdle : undefined} />
            </div>
          ))}
        </div>
      )}
      {planned && <p className="muted small">Kickoff のチャットで {label} を使えるようにするのは、今後の対応予定です（いまは使用状況を見られるだけです）。</p>}
      {s.notes.length > 0 && <p className="muted small">{s.notes.join(" ・ ")}</p>}
      {s.message && (s.status === "error" ? <ErrorText message={s.message} /> : <p className="muted small">{s.message}</p>)}
    </div>
  );
}
