import type { RefObject } from "react";
import type { ServiceUsage } from "@shared/types";
import { formatClock } from "@/lib/time";
import { ErrorText } from "@/ui/ErrorText";
import { Popover } from "@/ui/Popover";
import { planLabel } from "./usage";
import { UsageMeter } from "./UsageMeter";

interface Props {
  anchor: RefObject<HTMLElement | null>;
  service: ServiceUsage;
  refreshing: boolean;
  error?: string;
  onRefresh: () => void;
  onClose: () => void;
}

/** Codex などの使用状況の詳細。Claude Code と同じ位置・見た目・開閉操作にそろえる。 */
export function ServiceUsagePopover({ anchor, service, refreshing, error, onRefresh, onClose }: Props) {
  const plan = `${service.label}${service.plan ? ` ${planLabel(service.plan)}` : ""}`;
  return (
    <Popover
      anchor={anchor}
      side="above"
      align="end"
      gap={8}
      portal
      escape="pass"
      title={`使用状況（${plan}）`}
      refresh={{ label: "使用状況を更新", title: "更新", busy: refreshing, onClick: onRefresh }}
      label={`${service.label} の使用状況の詳細`}
      className="usage-popover"
      onClose={onClose}
    >
      <ServiceUsageDetails service={service} error={error} />
    </Popover>
  );
}

/** 取得できた枠・アカウント・補足と、取得できない理由（更新の失敗でも直前の枠は残す）。 */
export function ServiceUsageDetails({ service, error }: { service: ServiceUsage; error?: string }) {
  return (
    <div className="usage-popover-body">
      {service.account && <p className="muted small usage-popover-foot">{service.account}</p>}
      {service.status === "ok" && (
        service.windows.length > 0 ? service.windows.map((window) => (
          <UsageMeter key={window.key} window={window} />
        )) : <p className="muted small usage-popover-foot">使用枠の情報はありません</p>
      )}
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
