import "./AnsiText.css";
import type { CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import type { MarkedSpan } from "./ansi";

/**
 * 色のまとまり 1 つ（16 色は CSS の決まった色 ansi-*、ほかは style。Docker のログと CI のジョブのログが使う）。
 * matchClass は見つけた所の印のクラス（いま選んでいるものには is-current も付ける）
 */
export function AnsiText({ span, matchClass }: { span: MarkedSpan; matchClass?: string }) {
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
    span.mark !== 0 && matchClass,
    span.mark === 2 && matchClass && "is-current",
  );
  if (!className && !span.fg && !span.bg) return <>{span.text}</>;
  return (
    <span className={className || undefined} style={style}>
      {span.text}
    </span>
  );
}
