import type { RefObject } from "react";
import type { PlanUsage, ProviderStatus } from "@shared/ai/types";
import { providerLabel } from "@/features/ai/ui/provider/providerChoice";
import { PlanUsageDetails } from "./PlanUsageDetails";
import { ServiceUsageDetails } from "./ServiceUsageDetails";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { Popover } from "@/foundation/ui/kit/Popover";
import { groupChipText, UsageChip } from "./UsageChip";
import type { UsageGroup } from "./usageGroups";

interface Props {
  /** 押した下の帯の AI のボタン（その右端にそろえて上に出す） */
  anchor: RefObject<HTMLElement | null>;
  group: UsageGroup;
  usage: PlanUsage | undefined;
  status: ProviderStatus | undefined;
  refreshing: boolean;
  error?: string;
  /** 見出しの更新（取り直すものがない「使った分の支払い」では出さない） */
  onRefresh?: () => void;
  onClose: () => void;
}

/**
 * 下の帯の AI のボタンを押したときに、右下から出るその AI の詳細。見出しは札と名前、中身は Claude ならプランの枠（5 時間・週・モデル別の週と取得時刻）、
 * ほかの AI はサービスの詳細（全使用枠・リセット時刻・アカウント・補足・取得時刻・取得できない理由）。画面は移らない
 */
export function UsageDetailsPopover({ anchor, group, usage, status, refreshing, error, onRefresh, onClose }: Props) {
  const name = providerLabel(group.provider, status);
  return (
    <Popover
      anchor={anchor}
      side="above"
      align="end"
      gap={8}
      portal
      escape="pass"
      title={
        <span className="usage-popover-title">
          <UsageChip provider={group.provider} text={groupChipText(group, usage, status)} />
          {name}
        </span>
      }
      refresh={onRefresh && { label: "使用状況を更新", title: "更新", busy: refreshing, onClick: onRefresh }}
      label={`${name} の使用状況の詳細`}
      className="usage-popover"
      onClose={onClose}
    >
      <GroupDetails group={group} usage={usage} error={error} />
    </Popover>
  );
}

function GroupDetails({ group, usage, error }: { group: UsageGroup; usage: PlanUsage | undefined; error?: string }) {
  switch (group.kind) {
    case "plan":
      return (
        <>
          <PlanUsageDetails usage={usage} />
          <ErrorText message={error} />
        </>
      );
    case "service":
      return <ServiceUsageDetails service={group.service} error={error} />;
    case "pay":
      return <p className="muted small usage-popover-foot">API キーで動かしています（使った分の支払い。プランの使用枠はありません）</p>;
    case "missing":
      return group.service ? (
        <ServiceUsageDetails service={group.service} error={error} />
      ) : (
        <>
          <p className="muted small usage-popover-foot">取得中…</p>
          <ErrorText message={error} />
        </>
      );
  }
}
