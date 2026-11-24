import "./FooterUsage.css";
import { Fragment } from "react";
import type { ProviderStatus } from "@shared/ai/types";
import { paysByCredits, planWindows, type ProviderUsage } from "@shared/ai/usage";
import { useForegroundProvider } from "@/features/ai/ui/provider/chatProvider";
import { providerLabel, statusOf } from "@/features/ai/ui/provider/providerChoice";
import { FIVE_HOUR_IDLE, usePlanUsage } from "./usage";
import { UsageMeter } from "./UsageMeter";
import { refreshServiceUsage, useServiceUsage } from "./serviceUsageStore";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { cx } from "@/foundation/ui/lib/cx";
import { useProviders } from "@/features/ai/ui/stores/providers";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { groupChipText, UsageChip } from "./UsageChip";
import { CodexCreditsBadge, OverageBadge, useOverageToast } from "./OverageBadge";
import { UsageDetailsPopover } from "./UsageDetailsPopover";
import { usageGroups, type UsageGroup } from "./usageGroups";

/**
 * 下の帯の右の使用状況。Claude と Codex（と、前に出しているチャットのほかの AI）を、AI ごとのまとまり（札 ＋ 枠のメーター）で並べる。
 * まとまりごとに別のボタンで、押すとその AI の詳細を開く
 */
export function FooterUsage() {
  const planUsage = usePlanUsage();
  const foreground = useForegroundProvider();
  const statuses = useProviders({ active: false }).data;
  const services = useServiceUsage();
  const groups = usageGroups({ foreground, statuses, services: services.data });
  useOverageToast(planUsage.usage?.pay_as_you_go, services.data?.find((s) => paysByCredits(s.provider))?.pay_as_you_go);
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
 * （Claude はプランの枠だけ、ほかはすべての AI の使用状況を `POST /api/usage/refresh` で）
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
  usage: ProviderUsage | undefined;
  status: ProviderStatus | undefined;
  loading: boolean;
}) {
  const chip = <UsageChip provider={group.provider} text={groupChipText(group, usage, status)} />;
  const meters = (() => {
    switch (group.kind) {
      case "plan":
        if (!usage) return <span className="muted">取得中…</span>;
        if (usage.status !== "ok") return <span className="muted">取得できません</span>;
        return <PlanMeters usage={usage} />;
      case "service":
        return (
          <>
            {paysByCredits(group.provider) && <CodexCreditsBadge pay={group.service.pay_as_you_go} />}
            {group.service.windows.map((w) => (
              <UsageMeter key={w.key} window={w} inline />
            ))}
          </>
        );
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

/** プランの使用枠の札の横（超過分の印と、5 時間・週・モデル別の週の短いメーター） */
function PlanMeters({ usage }: { usage: ProviderUsage }) {
  const { fiveHour, sevenDay, modelWeekly } = planWindows(usage);
  return (
    <>
      <OverageBadge pay={usage.pay_as_you_go} />
      <UsageMeter window={fiveHour} inline idleText={FIVE_HOUR_IDLE} />
      <UsageMeter window={sevenDay} inline />
      {/* モデル別の週枠（Fable など）。1 行表示では短く「Fable」と出す（usageWindowLabel） */}
      {modelWeekly.map((w) => (
        <UsageMeter key={w.key} window={w} inline />
      ))}
    </>
  );
}
