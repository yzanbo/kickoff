import type { RefObject } from "react";
import { FIVE_HOUR_IDLE, planName, usageUnavailableText, type usePlanUsage } from "./usage";
import { Popover } from "@/ui/Popover";
import { UsageFetchedNote } from "./UsageFetchedNote";
import { UsageMeter } from "./UsageMeter";

interface Props {
  /** 開いた右下の使用状況（その右端にそろえて上に出す） */
  anchor: RefObject<HTMLElement | null>;
  planUsage: ReturnType<typeof usePlanUsage>;
  onClose: () => void;
}

/** フッターの使用状況を押したときに、右下から出る詳細（画面は移らない） */
export function UsagePopover({ anchor, planUsage, onClose }: Props) {
  const { usage, refresh, refreshing } = planUsage;
  const plan = planName(usage);

  // 外側のクリック・Esc で閉じる（フッターのボタン自体はそちらで開閉する）
  return (
    <Popover
      anchor={anchor}
      side="above"
      align="end"
      gap={8}
      portal
      escape="pass"
      title={`使用状況${plan ? `（${plan}）` : ""}`}
      refresh={{ label: "使用状況を更新", title: "更新", busy: refreshing, onClick: () => void refresh() }}
      label="使用状況の詳細"
      className="usage-popover"
      onClose={onClose}
    >
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
    </Popover>
  );
}
