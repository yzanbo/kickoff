import { RefreshCw, X } from "lucide-react";
import { useRef } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { FIVE_HOUR_IDLE, planName, type usePlanUsage } from "../usage";
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
        <button className="icon-button" title="更新" aria-label="使用状況を更新" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw size={13} className={refreshing ? "spin" : ""} />
        </button>
        <button className="icon-button" title="閉じる（Esc）" aria-label="閉じる" onClick={onClose}>
          <X size={14} />
        </button>
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
            {new Date(usage.fetched_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 時点（5 分ごとに自動更新）
            {usage.error && <span className="error"> ・最新の取得に失敗: {usage.error}</span>}
          </p>
        </div>
      )}
    </div>
  );
}
