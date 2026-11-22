import type { ServiceUsage } from "@shared/ai/types";
import { formatClock } from "@/foundation/ui/lib/time";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { StatusDot, toneOf } from "@/foundation/ui/kit/StatusDot";
import { PLANNED_BADGE } from "@/features/ai/ui/provider/plannedProviders";
import { SpendState } from "./SpendState";
import { FIVE_HOUR_IDLE, planLabel } from "./usage";
import { UsageFetchedNote } from "./UsageFetchedNote";
import { UsageMeter } from "./UsageMeter";

interface Props {
  service: ServiceUsage;
  /** popover = 下の帯の詳細の中身（既定）、panel = 設定の「使用状況」のサービスの 1 まとまり */
  variant?: "popover" | "panel";
  /** 取り直しの失敗（popover だけ。更新に失敗しても直前の枠は残す） */
  error?: string;
  /** Kickoff のチャットで使うのは今後の対応予定の AI（panel だけ） */
  planned?: boolean;
}

/** サービスごとの使用状況（枠・アカウント・クレジットの様子（Codex）・補足と、取得できない理由。取り直しに失敗しても直前の枠は残す） */
export function ServiceUsageDetails({ service, variant = "popover", error, planned = false }: Props) {
  return variant === "panel" ? <ServicePanel service={service} planned={planned} /> : <ServicePopover service={service} error={error} />;
}

/** 下の帯の詳細の中身 */
function ServicePopover({ service, error }: { service: ServiceUsage; error?: string }) {
  return (
    <div className="usage-popover-body">
      {service.account && <p className="muted small usage-popover-foot">{service.account}</p>}
      {service.status === "ok" && (
        service.windows.length > 0 ? service.windows.map((window) => (
          <UsageMeter key={window.key} window={window} />
        )) : <p className="muted small usage-popover-foot">使用枠の情報はありません</p>
      )}
      {service.status === "ok" && service.credits && <SpendState credits={service.credits} />}
      {service.notes.length > 0 && <p className="muted small usage-popover-foot">{service.notes.join(" ・ ")}</p>}
      {service.message && (service.status === "error"
        ? <ErrorText message={service.message} />
        : <p className="muted small usage-popover-foot">{service.message}</p>)}
      <ErrorText message={error} />
      <UsageFetchedNote usage={service} className="usage-popover-foot" />
    </div>
  );
}

/** 設定の「使用状況」の 1 つのサービス: 名前・プラン・アカウントと、枠のメーター（見られなければ理由） */
function ServicePanel({ service: s, planned }: { service: ServiceUsage; planned: boolean }) {
  return (
    <div className="usage-service">
      <div className="usage-service-head">
        <StatusDot tone={toneOf(s.status === "ok" ? true : s.status === "error" ? false : null)} />
        <h3>{s.label}</h3>
        {planned && <span className="badge">{PLANNED_BADGE}</span>}
        {s.plan && <span className="plan-chip tag" data-look="outline">{planLabel(s.plan)}</span>}
        {s.account && <span className="muted small usage-service-account">{s.account}</span>}
        {s.status === "ok" && <span className="muted small usage-service-time">{formatClock(s.fetched_at)} 時点</span>}
      </div>
      {s.status === "ok" && s.windows.length > 0 && (
        <div className="card-grid">
          {s.windows.map((w) => (
            <div className="card" key={w.key}>
              <UsageMeter window={w} idleText={s.id === "claude" && w.key === "five_hour" ? FIVE_HOUR_IDLE : undefined} />
            </div>
          ))}
        </div>
      )}
      {planned && <p className="muted small">Kickoff のチャットで {s.label} を使えるようにするのは、今後の対応予定です（いまは使用状況を見られるだけです）。</p>}
      {s.notes.length > 0 && <p className="muted small">{s.notes.join(" ・ ")}</p>}
      {s.message && (s.status === "error" ? <ErrorText message={s.message} /> : <p className="muted small">{s.message}</p>)}
    </div>
  );
}
