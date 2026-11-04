import type { UsageWindow } from "../../../../core/types";
import { formatReset, resetInShort } from "../../time";
import { usageLevel } from "../../usage";

type Severity = "idle" | "normal" | "warning" | "critical";

function severityOf(utilization: number | null): Severity {
  return utilization === null ? "idle" : usageLevel(utilization);
}

// 色だけで状態を伝えないよう、注意以上はアイコンとラベルを必ず添える
const SEVERITY_LABELS: Record<Severity, string | null> = {
  idle: null,
  normal: null,
  warning: "⚠ 残りわずか",
  critical: "⛔ 上限間近",
};

interface Props {
  window: UsageWindow;
  compact?: boolean;
  /**
   * フッター用の 1 行表示（ラベル・バー・値を横に並べる）。「残りわずか」「上限間近」の文は並べない（バーの色と % で分かり、
   * 帯の幅を取るため）。マウスを乗せたときの説明と読み上げには残す
   */
  inline?: boolean;
  /** 枠が始まっていないときの説明 */
  idleText?: string;
}

/** 使用枠のメーター（使用率に応じて 通常 → 注意 → 上限間近 と色とラベルが変わる） */
export function UsageMeter({ window: w, compact, inline, idleText }: Props) {
  const severity = severityOf(w.utilization);
  const percent = Math.min(100, Math.max(0, w.utilization ?? 0));
  const reset = formatReset(w.resets_at);
  const status = w.utilization !== null && w.utilization >= 100 ? "⛔ 上限に到達" : SEVERITY_LABELS[severity];
  const valueText = w.utilization === null ? "情報なし" : `${Math.round(w.utilization)}%`;
  // 使った量（"120 / 300 回" など）とリセットの時刻
  const detail = w.utilization === null ? idleText : [w.detail, reset].filter(Boolean).join(" ・ ") || undefined;
  const resetShort = resetInShort(w.resets_at);

  if (inline) {
    return (
      <span className={`meter meter-inline meter-${severity}`} title={[status, detail].filter(Boolean).join("\n") || undefined}>
        <span className="meter-label">{w.label}</span>
        <span
          className="meter-track"
          role="meter"
          aria-label={`${w.label}の使用率`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={w.utilization ?? 0}
          aria-valuetext={`${valueText}${status ? `、${status}` : ""}`}
        >
          <span className="meter-fill" style={{ width: `${percent}%` }} />
        </span>
        <span className="meter-value">{valueText}</span>
        {/* リセットまでの残り（フッターでは短く） */}
        {w.utilization !== null && resetShort && (
          <span className="meter-reset" aria-label={`${resetShort}にリセット`}>
            ↻{resetShort}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={`meter meter-${severity} ${compact ? "meter-compact" : ""}`} title={detail ?? undefined}>
      <div className="meter-head">
        <span className="meter-label">{w.label}</span>
        <span className="meter-value">{valueText}</span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={`${w.label}の使用率`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={w.utilization ?? 0}
        aria-valuetext={`${valueText}${status ? `、${status}` : ""}`}
      >
        <div className="meter-fill" style={{ width: `${percent}%` }} />
      </div>
      {(status || (!compact && detail)) && (
        <div className="meter-foot">
          {status && <span className="meter-status">{status}</span>}
          {!compact && detail && <span className="meter-detail">{detail}</span>}
        </div>
      )}
    </div>
  );
}
