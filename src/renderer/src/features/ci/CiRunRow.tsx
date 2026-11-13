import { memo } from "react";
import { ExternalLink } from "lucide-react";
import type { CiExternalCheck, CiRun } from "@shared/types";
import { cx } from "@/lib/cx";
import { formatDayTime, relativeTime } from "@/lib/time";
import { CiStateIcon } from "./CiStateIcon";
import { runName } from "./ciView";

/** 実行の一覧の 1 行（状態・題・ワークフロー #番号・ブランチ・きっかけ・PR・起こした人・時刻） */
export const CiRunRow = memo(function CiRunRow({ run, selected, watched, onOpen }: { run: CiRun; selected: boolean; watched: boolean; onOpen: (run: CiRun) => void }) {
  return (
    <button type="button" className={cx("github-item ci-run-row", selected && "selected")} aria-current={selected || undefined} onClick={() => onOpen(run)}>
      <CiStateIcon state={run.state} />
      <span className="github-item-main">
        <span className="github-item-title">
          <span className="github-item-title-text">{run.title}</span>
        </span>
        <span className="github-item-meta muted small">
          <span>{runName(run)}{run.attempt > 1 ? `（${run.attempt} 回目）` : ""}</span>
          {run.branch && (
            <code className={cx("ci-branch", watched && "watched")} data-tip={watched ? "作業場所のブランチ・既定のブランチ（落ちたら知らせる）" : undefined}>
              {run.branch}
            </code>
          )}
          {run.pulls.length > 0 && <span>PR {run.pulls.map((n) => `#${n}`).join(", ")}</span>}
          <span>{run.event}</span>
          {run.actor && <span>{run.actor}</span>}
          <span data-tip={formatDayTime(run.created_at)}>{relativeTime(run.created_at)}</span>
        </span>
      </span>
    </button>
  );
});

/** 外の CI の 1 行（GitHub Actions でないもの。成否と GitHub に来るリンクだけ。ログ・AI に渡す・やり直しはない） */
export function CiExternalRow({ check }: { check: CiExternalCheck }) {
  return (
    <div className="github-item ci-external-row">
      <CiStateIcon state={check.state} />
      <span className="github-item-main">
        <span className="github-item-title">
          <span className="github-item-title-text">{check.name}</span>
        </span>
        <span className="github-item-meta muted small">
          <code className="ci-branch">{check.branch}</code>
          <span>{check.sha.slice(0, 7)}</span>
          {check.description && <span className="ci-external-desc">{check.description}</span>}
          {check.updated_at && <span data-tip={formatDayTime(check.updated_at)}>{relativeTime(check.updated_at)}</span>}
        </span>
      </span>
      {check.url && (
        <a className="ci-external-link" href={check.url} target="_blank" rel="noreferrer" aria-label="詳細を開く" data-tip="詳細を開く（外のブラウザ）">
          <ExternalLink size={13} aria-hidden />
        </a>
      )}
    </div>
  );
}
