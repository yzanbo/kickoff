import "./GitHubChecksList.css";
import { ExternalLink, ScrollText } from "lucide-react";
import { CI_STATE_LABELS } from "@shared/github/ciTypes";
import type { GitHubCheck } from "@shared/github/types";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { openCiRun } from "@/features/github/ui/ci/ciLinks";
import { CheckStateIcon, ciTone } from "./CheckStateIcon";
import { checkDuration } from "./githubChecks";

/** チェックの状態の名前（添え書き detail があればそれ。時間切れ・対応が要るなど。途中は「途中」） */
const checkLabel = (c: GitHubCheck) => c.detail ?? (c.state === "pending" ? "途中" : CI_STATE_LABELS[c.state]);

/** 並べる順（落ちた → 途中 → 通った → ほか） */
const ORDER = { failure: 0, pending: 1, success: 2, neutral: 3 };

/**
 * PR のチェックの一覧（CI の成否・所要時間と GitHub の詳細へのリンク）。GitHub Actions のチェックには「ログを開く」（CI のタブでその実行・ジョブを開く。
 * ログを読む・AI に渡す・やり直すは CI のタブで）
 */
export function GitHubChecksList({ projectId, checks }: { projectId: number; checks: GitHubCheck[] }) {
  if (checks.length === 0) return <p className="muted small github-checks-empty">この PR の最新のコミットにはチェックがありません。</p>;
  const rows = checks.map((c) => ({ c, tone: ciTone(c.state) })).sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
  return (
    <ul className="github-checks-list">
      {rows.map(({ c }, i) => (
        <li key={`${c.workflow ?? ""}/${c.name}/${i}`} className="github-check">
          <CheckStateIcon state={c.state} label={checkLabel(c)} />
          <span className="github-check-name">
            {c.workflow && <span className="muted">{c.workflow} / </span>}
            {c.name}
          </span>
          {c.description && <span className="github-check-desc muted small">{c.description}</span>}
          {checkDuration(c) && (
            <span className="github-check-time muted small" data-tip={c.completed_at ? "所要時間" : "始まってから今まで"}>
              {checkDuration(c)}
            </span>
          )}
          {c.run_id !== null && (
            <IconButton icon={ScrollText} iconSize={13} className="github-check-log" label="ログを開く" title="CI のタブでこの実行のログを開く" onClick={() => openCiRun(projectId, c.run_id!, c.job_id)} />
          )}
          {c.url && <a className="github-check-link" href={c.url} target="_blank" rel="noreferrer" aria-label="GitHub で詳細を見る" data-tip="GitHub で詳細を見る">
            <ExternalLink size={13} aria-hidden />
          </a>}
        </li>
      ))}
    </ul>
  );
}
