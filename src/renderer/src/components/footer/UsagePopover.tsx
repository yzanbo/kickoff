import { useRef } from "react";
import { useDismiss } from "../../hooks/useDismiss";
import { FIVE_HOUR_IDLE, planName, usageUnavailableText, type usePlanUsage } from "../../usage";
import { PopoverHeader } from "../PopoverHeader";
import { UsageFetchedNote } from "./UsageFetchedNote";
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
      <PopoverHeader
        title={`使用状況${plan ? `（${plan}）` : ""}`}
        refresh={{ label: "使用状況を更新", title: "更新", busy: refreshing, onClick: () => void refresh() }}
        onClose={onClose}
      />
      {!usage ? (
        <p className="muted small">取得中…</p>
      ) : !usage.available ? (
        <p className="muted small">{usageUnavailableText(usage)}</p>
      ) : (
        <div className="usage-popover-body">
          <UsageMeter window={usage.five_hour} idleText={FIVE_HOUR_IDLE} />
          <UsageMeter window={usage.seven_day} />
          {usage.model_weekly.map((w) => (
            <UsageMeter key={w.key} window={w} />
          ))}
          <UsageFetchedNote usage={usage} className="usage-popover-foot" />
        </div>
      )}
    </div>
  );
}
