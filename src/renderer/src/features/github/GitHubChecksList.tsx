import { Check, CircleDashed, CircleMinus, ExternalLink, ScrollText, X, type LucideIcon } from "lucide-react";
import type { GitHubCheck } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { openCiRun } from "@/features/ci/ciLinks";
import { checkDuration } from "./githubChecks";

/** チェックの状態の印と名前（GitHub の conclusion を小文字にしたもの） */
function stateOf(state: string): { icon: LucideIcon; tone: "success" | "failure" | "pending" | "neutral"; label: string } {
  switch (state) {
    case "success":
      return { icon: Check, tone: "success", label: "通った" };
    case "failure":
    case "timed_out":
    case "startup_failure":
    case "action_required":
      return { icon: X, tone: "failure", label: state === "timed_out" ? "時間切れ" : state === "action_required" ? "対応が要る" : "落ちた" };
    case "pending":
      return { icon: CircleDashed, tone: "pending", label: "途中" };
    case "skipped":
      return { icon: CircleMinus, tone: "neutral", label: "飛ばした" };
    case "cancelled":
      return { icon: CircleMinus, tone: "neutral", label: "取り消した" };
    default:
      return { icon: CircleMinus, tone: "neutral", label: state };
  }
}

/** 並べる順（落ちた → 途中 → 通った → ほか） */
const ORDER = { failure: 0, pending: 1, success: 2, neutral: 3 };

/**
 * PR のチェックの一覧（CI の成否・所要時間と GitHub の詳細へのリンク）。GitHub Actions のチェックには「ログを開く」（CI のタブでその実行・ジョブを開く。
 * ログを読む・AI に渡す・やり直すは CI のタブで）
 */
export function GitHubChecksList({ projectId, checks }: { projectId: number; checks: GitHubCheck[] }) {
  if (checks.length === 0) return <p className="muted small github-checks-empty">この PR の最新のコミットにはチェックがありません。</p>;
  const rows = checks.map((c) => ({ c, s: stateOf(c.state) })).sort((a, b) => ORDER[a.s.tone] - ORDER[b.s.tone]);
  return (
    <ul className="github-checks-list">
      {rows.map(({ c, s }, i) => (
        <li key={`${c.workflow ?? ""}/${c.name}/${i}`} className="github-check">
          <s.icon size={14} className={`github-checks github-checks-${s.tone}`} aria-label={s.label} data-tip={s.label} />
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
            <IconButton icon={ScrollText} size={13} className="github-check-log" label="ログを開く" title="CI のタブでこの実行のログを開く" onClick={() => openCiRun(projectId, c.run_id!, c.job_id)} />
          )}
          {c.url && <a className="github-check-link" href={c.url} target="_blank" rel="noreferrer" aria-label="GitHub で詳細を見る" data-tip="GitHub で詳細を見る">
            <ExternalLink size={13} aria-hidden />
          </a>}
        </li>
      ))}
    </ul>
  );
}
