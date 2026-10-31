import type { ReactNode } from "react";

interface Props {
  title: string;
  ok: boolean | undefined;
  detail: ReactNode;
  badge?: string;
}

/** 外部 CLI（Claude Code・gh など）の状態表示 */
export function StatusCard({ title, ok, detail, badge }: Props) {
  const state = ok === undefined ? "pending" : ok ? "ok" : "ng";
  return (
    <div className={`status-card status-${state}`}>
      <div className="status-title">
        <span className="status-dot" />
        {title}
        {badge && <span className="badge">{badge}</span>}
      </div>
      <div className="status-detail">{detail}</div>
    </div>
  );
}
