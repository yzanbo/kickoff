import type { Approval, Run } from "../../../core/types";
import { href } from "../router";
import { RUN_STATUS_LABELS, RunStatusIcon } from "./RunStatus";
import { SectionBadge } from "./SectionBadge";

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

/** チャットの一覧（各行はチャット画面へのリンク） */
export function RunList({ projectId, runs, approvals }: { projectId: number; runs: Run[]; approvals: Approval[] }) {
  if (runs.length === 0) return <div className="empty">チャットはまだありません</div>;
  return (
    <ul className="run-list">
      {runs.map((r) => {
        const waiting = approvals.some((a) => a.run_id === r.id);
        return (
          <li key={r.id}>
            <a className={`run-item ${waiting ? "is-waiting" : ""}`} href={href({ name: "run", projectId, runId: r.id })}>
              <RunStatusIcon run={r} waiting={waiting} />
              <span className="run-item-title">{r.title || "チャット"}</span>
              <SectionBadge section={r.phase} short />
              <span className="run-item-time" title={RUN_STATUS_LABELS[waiting ? "waiting" : r.status]}>
                {relativeTime(r.updated_at)}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
