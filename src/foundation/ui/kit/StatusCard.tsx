import "./StatusCard.css";
import type { ReactNode } from "react";
import { StatusDot, toneOf } from "./StatusDot";

interface Props {
  title: string;
  /** true = 使える / false = 使えない / null = 対応予定 / undefined = 確認中 */
  ok: boolean | null | undefined;
  detail: ReactNode;
  badge?: string;
}

/** 外部 CLI（Claude Code・gh など）の状態表示 */
export function StatusCard({ title, ok, detail, badge }: Props) {
  return (
    <div className="card">
      <div className="status-title">
        <StatusDot tone={toneOf(ok)} />
        {title}
        {badge && <span className="badge">{badge}</span>}
      </div>
      <div className="status-detail">{detail}</div>
    </div>
  );
}

