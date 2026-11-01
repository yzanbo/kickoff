import { useRef } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { formatClock } from "../time";
import { FIVE_HOUR_IDLE, planName, type usePlanUsage } from "../usage";
import { CloseButton, RefreshButton } from "./IconButton";
import { UsageMeter } from "./UsageMeter";

interface Props {
  planUsage: ReturnType<typeof usePlanUsage>;
  onClose: () => void;
}

/** フッターの使用状況を押したときに、右下から出る詳細（画面は移らない） */
export function UsagePopover({ planUsage, onClose }: Props) {
  const { usage, refresh, refreshing } = planUsage;
  const plan = planName(usage);
  const ref = useRef<HTMLDivElement>(null);

  // 外側のクリック・Esc で閉じる（フッターのボタン自体はそちらで開閉する）
  useDismiss(ref, onClose, { ignore: ".footer-usage", escape: "pass" });

  return (
    <div ref={ref} className="usage-popover" role="dialog" aria-label="使用状況の詳細">
      <div className="usage-popover-head">
        <span className="usage-popover-title">使用状況{plan ? `（${plan}）` : ""}</span>
        <RefreshButton label="使用状況を更新" title="更新" size={13} busy={refreshing} onClick={() => void refresh()} />
        <CloseButton title="閉じる（Esc）" onClick={onClose} />
      </div>
      {!usage ? (
        <p className="muted small">取得中…</p>
      ) : !usage.available ? (
        <p className="muted small">プランの使用枠を取得できませんでした{usage.error ? `（${usage.error}）` : ""}。</p>
      ) : (
        <div className="usage-popover-body">
          <UsageMeter window={usage.five_hour} idleText={FIVE_HOUR_IDLE} />
          <UsageMeter window={usage.seven_day} />
          {usage.model_weekly.map((w) => (
            <UsageMeter key={w.key} window={w} />
          ))}
          <p className="muted small usage-popover-foot">
            {formatClock(usage.fetched_at)} 時点（5 分ごとに自動更新）
            {usage.error && <span className="error"> ・最新の取得に失敗: {usage.error}</span>}
          </p>
        </div>
      )}
    </div>
  );
}
