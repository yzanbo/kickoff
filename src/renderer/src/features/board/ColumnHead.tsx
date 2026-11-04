import type { ReactNode } from "react";
import { StatusDot } from "@/ui/StatusDot";

/** ボードの列・リストのまとまりの見出し（色の点・名前・件数。action は右端に置くもの） */
export function ColumnHead({ label, tone, count, action }: { label: string; tone: string; count: number; action?: ReactNode }) {
  return (
    <header className="column-head">
      <StatusDot color={tone} />
      <span className="column-title">{label}</span>
      <span className="column-count">{count}</span>
      {action && <span className="spacer" />}
      {action}
    </header>
  );
}
