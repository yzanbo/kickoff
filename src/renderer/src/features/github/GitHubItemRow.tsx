import { memo, type CSSProperties } from "react";
import { Check, CircleDashed, MessageSquare, X } from "lucide-react";
import type { GitHubChecksState, GitHubItem, GitHubLabel, GitHubReviewDecision } from "@shared/types";
import { cx } from "@/lib/cx";
import { agoText } from "@/lib/time";
import { GitHubStateIcon } from "./GitHubStateIcon";

/** ラベルの札（GitHub の色の点 ＋ 名前） */
export function GitHubLabels({ labels }: { labels: GitHubLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="github-labels">
      {labels.map((l) => (
        <span key={l.name} className="github-label" style={{ "--label-color": `#${l.color}` } as CSSProperties}>
          {l.name}
        </span>
      ))}
    </span>
  );
}

const CHECKS_TEXT: Record<GitHubChecksState, string> = { success: "チェックが通った", failure: "チェックが落ちた", pending: "チェックの途中" };
const CHECKS_ICON = { success: Check, failure: X, pending: CircleDashed };

/** CI の成否の印（PR の一覧・中身） */
export function GitHubChecksMark({ state }: { state: GitHubChecksState | null }) {
  if (!state) return null;
  const Icon = CHECKS_ICON[state];
  return <Icon size={13} className={`github-checks github-checks-${state}`} aria-label={CHECKS_TEXT[state]} data-tip={CHECKS_TEXT[state]} />;
}

export const REVIEW_DECISION_LABELS: Record<GitHubReviewDecision, string> = { approved: "承認済み", changes_requested: "変更の依頼あり", review_required: "レビュー待ち" };

/** 一覧の 1 行（状態の印・題名とラベル・番号・作った人・更新・コメントの数・PR は CI とレビュー） */
export const GitHubItemRow = memo(function GitHubItemRow({ item, selected, onOpen }: { item: GitHubItem; selected: boolean; onOpen: (item: GitHubItem) => void }) {
  return (
    <button type="button" className={cx("github-item", selected && "selected")} aria-current={selected || undefined} onClick={() => onOpen(item)}>
      <GitHubStateIcon item={item} />
      <span className="github-item-main">
        <span className="github-item-title">
          <span className="github-item-title-text">{item.title}</span>
          <GitHubLabels labels={item.labels} />
        </span>
        <span className="github-item-meta">
          <span>#{item.number}</span>
          {item.author && <span>{item.author.login}</span>}
          <span>更新 {agoText(item.updated_at)}</span>
          {item.review_decision && <span className={`github-review github-review-${item.review_decision}`}>{REVIEW_DECISION_LABELS[item.review_decision]}</span>}
          <GitHubChecksMark state={item.checks} />
          {item.comments > 0 && (
            <span className="github-item-comments" aria-label={`コメント ${item.comments} 件`}>
              <MessageSquare size={12} aria-hidden />
              {item.comments}
            </span>
          )}
        </span>
      </span>
    </button>
  );
});
