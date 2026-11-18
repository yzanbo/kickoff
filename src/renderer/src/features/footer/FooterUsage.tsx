import { Fragment } from "react";
import type { PlanUsage, ProviderStatus } from "@shared/types";
import { useForegroundProvider } from "@/features/chat/provider/chatProvider";
import { providerLabel, statusOf } from "@/features/chat/provider/providerChoice";
import { FIVE_HOUR_IDLE, type usePlanUsage } from "@/features/usage/usage";
import { UsageMeter } from "@/features/usage/UsageMeter";
import { refreshServiceUsage, useServiceUsage } from "@/features/usage/serviceUsageStore";
import { useAction } from "@/hooks/useAction";
import { cx } from "@/lib/cx";
import { useProviders } from "@/stores/providers";
import { usePopover } from "@/ui/Popover";
import { groupChipText, UsageChip } from "./UsageChip";
import { OverageBadge, useOverageToast } from "./OverageBadge";
import { UsageDetailsPopover } from "./UsageDetailsPopover";
import { usageGroups, type UsageGroup } from "./usageGroups";

/**
 * 下の帯の右の使用状況。Claude と Codex（と、前に出しているチャットのほかの AI）を、AI ごとのまとまり（札 ＋ 枠のメーター）で並べる
 * （利用者の依頼。前は 1 つの AI だけを出し、札のメニューで切り替えていた）。まとまりごとに別のボタンで、押すとその AI の詳細を開く（利用者の依頼）
 */
export function FooterUsage({ planUsage }: { planUsage: ReturnType<typeof usePlanUsage> }) {
  const foreground = useForegroundProvider();
  const statuses = useProviders({ active: false }).data;
  const services = useServiceUsage();
  const groups = usageGroups({ foreground, statuses, services: services.data });
  useOverageToast(planUsage.usage);
  return (
    <span className="footer-usages">
      {groups.map((g, i) => (
        <Fragment key={g.provider}>
          {i > 0 && <span className="footer-usage-sep" aria-hidden />}
          <UsageGroupButton
            group={g}
            planUsage={planUsage}
            status={statusOf(statuses, g.provider)}
            loading={services.loading}
            loadError={services.error}
          />
        </Fragment>
      ))}
    </span>
  );
}

/**
 * 1 つの AI のボタン（札と枠のメーター）と、押すと上に開くその AI の詳細。詳細の更新は、その AI の分だけ取り直す
 * （Claude はプランの枠 `POST /api/usage/refresh`、ほかはサービスごとの使用状況 `POST /api/usage/services/refresh`）
 */
function UsageGroupButton({ group, planUsage, status, loading, loadError }: {
  group: UsageGroup;
  planUsage: ReturnType<typeof usePlanUsage>;
  status: ProviderStatus | undefined;
  loading: boolean;
  loadError: string | undefined;
}) {
  const { anchor, ...detail } = usePopover();
  const action = useAction<"refresh">();
  const name = providerLabel(group.provider, status);
  const plan = group.kind === "plan";
  const refresh = () => action.run("refresh", plan ? planUsage.refresh : refreshServiceUsage);
  return (
    <>
      <button
        type="button"
        ref={anchor}
        className={cx("footer-usage", detail.open && "active")}
        title={`${name} の使用状況の詳細`}
        aria-label={`${name} の使用状況の詳細`}
        aria-haspopup="dialog"
        aria-expanded={detail.open}
        onClick={detail.toggle}
      >
        <UsageGroupInline group={group} usage={planUsage.usage} status={status} loading={loading} />
      </button>
      {detail.open && (
        <UsageDetailsPopover
          anchor={anchor}
          group={group}
          usage={planUsage.usage}
          status={status}
          refreshing={action.busy !== null || (plan ? planUsage.refreshing : loading)}
          error={action.error ?? (plan ? undefined : loadError)}
          onRefresh={group.kind === "pay" ? undefined : () => void refresh()}
          onClose={detail.close}
        />
      )}
    </>
  );
}

/** ボタンの中身（札と、枠ごとの短いメーター。リセットまでの時間は乗せたときの説明に） */
function UsageGroupInline({ group, usage, status, loading }: {
  group: UsageGroup;
  usage: PlanUsage | undefined;
  status: ProviderStatus | undefined;
  loading: boolean;
}) {
  const chip = <UsageChip provider={group.provider} text={groupChipText(group, usage, status)} />;
  const meters = (() => {
    switch (group.kind) {
      case "plan":
        if (!usage) return <span className="muted">取得中…</span>;
        if (!usage.available) return <span className="muted">取得できません</span>;
        return (
          <>
            <OverageBadge usage={usage} />
            <UsageMeter window={usage.five_hour} inline idleText={FIVE_HOUR_IDLE} />
            <UsageMeter window={usage.seven_day} inline />
            {/* モデル別の週枠（Fable など）。1 行表示では短く「Fable」と出す（usageWindowLabel） */}
            {usage.model_weekly.map((w) => (
              <UsageMeter key={w.key} window={w} inline />
            ))}
          </>
        );
      case "service":
        return group.service.windows.map((w) => <UsageMeter key={w.key} window={w} inline />);
      case "pay":
        return null;
      case "missing":
        return <span className="muted">{!group.service && loading ? "取得中…" : "取得できません"}</span>;
    }
  })();
  return (
    <>
      {chip}
      {meters}
    </>
  );
}
