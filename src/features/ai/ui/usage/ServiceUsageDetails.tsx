import type { ServiceUsage } from "@shared/ai/types";
import { formatClock } from "@/foundation/ui/lib/time";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { CodexCreditsDetails } from "./CodexCreditsDetails";
import { UsageMeter } from "./UsageMeter";

/** 取得できた枠・アカウント・クレジットの様子（Codex）・補足と、取得できない理由（更新の失敗でも直前の枠は残す）。 */
export function ServiceUsageDetails({ service, error }: { service: ServiceUsage; error?: string }) {
  return (
    <div className="usage-popover-body">
      {service.account && <p className="muted small usage-popover-foot">{service.account}</p>}
      {service.status === "ok" && (
        service.windows.length > 0 ? service.windows.map((window) => (
          <UsageMeter key={window.key} window={window} />
        )) : <p className="muted small usage-popover-foot">使用枠の情報はありません</p>
      )}
      {service.status === "ok" && service.credits && <CodexCreditsDetails credits={service.credits} />}
      {service.notes.length > 0 && <p className="muted small usage-popover-foot">{service.notes.join(" ・ ")}</p>}
      {service.message && (service.status === "error"
        ? <ErrorText message={service.message} />
        : <p className="muted small usage-popover-foot">{service.message}</p>)}
      <ErrorText message={error} />
      <p className="muted small usage-popover-foot">
        {formatClock(service.fetched_at)} 時点（1 分ごとに自動更新）
      </p>
    </div>
  );
}
