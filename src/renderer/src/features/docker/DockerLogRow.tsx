import { memo, type CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { ansiSpans, markSpans, type MarkedSpan } from "./ansi";
import { clockOf, separatorText, type LogLevel, type LogRow } from "./dockerLogView";

/** 1 行を描くのに要るもの（変わらない限り描き直さない） */
export interface LogRowProps {
  row: LogRow;
  /** 並べている中の何番目か（選んだ範囲を行に戻すのに使う data-row） */
  index: number;
  /** 札の名前（app#1 など）と色の番号 */
  label: string;
  hue: number;
  showLabel: boolean;
  showTime: boolean;
  level: LogLevel | null;
  /** JSON の行を整えた文（押して開いているときだけ） */
  pretty: string | null;
  /** JSON として整えられる行か（押すと開く） */
  json: boolean;
  /** 見つけた所（色の印を外した文の位置）と、そのうちいま選んでいるものの番号 */
  marks: { start: number; end: number }[] | undefined;
  current: number | null;
  onToggleJson: (id: number) => void;
  onAsk: (index: number, at: { x: number; y: number }) => void;
}

/** 色のまとまり 1 つ（16 色は CSS の決まった色、ほかは style。CI のタブのログも使う） */
export function SpanView({ span }: { span: MarkedSpan }) {
  const style: CSSProperties = {};
  if (typeof span.fg === "string") style.color = span.fg;
  if (typeof span.bg === "string") style.backgroundColor = span.bg;
  const className = cx(
    typeof span.fg === "number" && `ansi-fg-${span.fg}`,
    typeof span.bg === "number" && `ansi-bg-${span.bg}`,
    span.bold && "ansi-bold",
    span.dim && "ansi-dim",
    span.italic && "ansi-italic",
    span.underline && "ansi-underline",
    span.mark === 1 && "docker-log-match",
    span.mark === 2 && "docker-log-match is-current",
  );
  if (!className && !span.fg && !span.bg) return <>{span.text}</>;
  return (
    <span className={className || undefined} style={style}>
      {span.text}
    </span>
  );
}

/**
 * ログの 1 行（エラー・警告の印・時刻・札・文）か、止まった・起動したの区切りの行。
 * エラーの行に乗せると「AI に聞く」（前後 20 行）。JSON の行は押すと整えて開く
 */
export const DockerLogRow = memo(function DockerLogRow({ row, index, label, hue, showLabel, showTime, level, pretty, json, marks, current, onToggleJson, onAsk }: LogRowProps) {
  if (row.kind !== "line")
    return (
      <div className={cx("docker-log-sep", row.kind === "stopped" && "is-stopped")} data-row={index}>
        ── {separatorText(row, label)} ──
      </div>
    );
  const spans = markSpans(ansiSpans(row.text), marks ?? [], current);
  return (
    <div className={cx("docker-log-row", level && `level-${level}`, json && "is-json")} data-row={index}>
      <span className="docker-log-level" aria-label={level === "error" ? "エラー" : level === "warn" ? "警告" : undefined} />
      {showTime && <span className="docker-log-time">{clockOf(row.ts)}</span>}
      {showLabel && <span className={`docker-log-label docker-log-c${hue}`}>{label}</span>}
      <span className="docker-log-text" onClick={json ? () => onToggleJson(row.id) : undefined} data-tip={json && !pretty ? "押すと JSON を整えて開く" : undefined}>
        {spans.map((s, i) => (
          <SpanView key={i} span={s} />
        ))}
        {pretty && <pre className="docker-log-json">{pretty}</pre>}
      </span>
      {level === "error" && (
        <button
          type="button"
          className="btn btn-sm docker-log-ask"
          data-tip="この行と前後 20 行をチャットの入力欄に足す（送るのは自分で）"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onAsk(index, { x: rect.left, y: rect.bottom + 2 });
          }}
        >
          AI に聞く
        </button>
      )}
    </div>
  );
});
