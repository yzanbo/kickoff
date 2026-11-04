import type { UsageWindow } from "@shared/types";
import { cx } from "@/lib/cx";
import { formatReset, resetInShort } from "@/lib/time";
import { usageLevel, usageWindowLabel } from "./usage";

/** 使用率の段階（色。idle = 枠が始まっていない・数値がない） */
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

/**
 * 使用率のバー（使用枠のメーター・チャット欄のコンテキストウィンドウで共通）。使用率に応じて 通常 → 注意 → 上限間近 と色が変わる。
 * percent が null なら、まだ始まっていない枠（灰色）。label は読み上げの名前、valueText は読み上げる値
 */
export function UsageBar({ percent, label, valueText, className }: { percent: number | null; label: string; valueText: string; className?: string }) {
  const width = Math.min(100, Math.max(0, percent ?? 0));
  return (
    <span
      className={cx("meter-track", `meter-${severityOf(percent)}`, className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? 0}
      aria-valuetext={valueText}
    >
      <span className="meter-fill" style={{ width: `${width}%` }} />
    </span>
  );
}

interface Props {
  window: UsageWindow;
  compact?: boolean;
  /**
   * フッター用の 1 行表示（ラベル・バー・値を横に並べる。モデル別の週枠はモデル名だけ）。「残りわずか」「上限間近」の文は並べない（バーの色と % で分かり、
   * 帯の幅を取るため）。マウスを乗せたときの説明と読み上げには残す
   */
  inline?: boolean;
  /** 枠が始まっていないときの説明 */
  idleText?: string;
}

/** 使用枠のメーター（使用率に応じて 通常 → 注意 → 上限間近 と色とラベルが変わる。名前の付け方は usageWindowLabel） */
export function UsageMeter({ window: w, compact, inline, idleText }: Props) {
  const severity = severityOf(w.utilization);
  const label = usageWindowLabel(w, inline);
  const reset = formatReset(w.resets_at);
  const status = w.utilization !== null && w.utilization >= 100 ? "⛔ 上限に到達" : SEVERITY_LABELS[severity];
  const valueText = w.utilization === null ? "情報なし" : `${Math.round(w.utilization)}%`;
  // 使った量（"120 / 300 回" など）とリセットの時刻
  const detail = w.utilization === null ? idleText : [w.detail, reset].filter(Boolean).join(" ・ ") || undefined;
  const resetShort = resetInShort(w.resets_at);
  const bar = <UsageBar percent={w.utilization} label={`${label}の使用率`} valueText={`${valueText}${status ? `、${status}` : ""}`} />;

  if (inline) {
    return (
      <span className={`meter meter-inline meter-${severity}`} title={[status, detail].filter(Boolean).join("\n") || undefined}>
        <span className="meter-label">{label}</span>
        {bar}
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
        <span className="meter-label">{label}</span>
        <span className="meter-value">{valueText}</span>
      </div>
      {bar}
      {(status || (!compact && detail)) && (
        <div className="meter-foot">
          {status && <span className="meter-status">{status}</span>}
          {!compact && detail && <span className="meter-detail">{detail}</span>}
        </div>
      )}
    </div>
  );
}
