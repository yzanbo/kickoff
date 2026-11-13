import { memo, type CSSProperties } from "react";
import { Check, CircleDashed, MessageSquare, MessagesSquare, X } from "lucide-react";
import type { Chat, GitHubChecksState, GitHubItem, GitHubLabel, GitHubReviewDecision } from "@shared/types";
import { openChat } from "@/app/router";
import { chatTitle } from "@/features/chat/chatTitle";
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

/**
 * 一覧の 1 行（状態の印・題名とラベル・番号・作った人・更新・担当・コメントの数・PR は CI とレビュー）。
 * 結び付いたチャットがあれば（chats。最近動いた順）、右上に印を出し、押すといちばん最近動いたチャットを開く。
 * fresh は取り直しで新しくなった行（少しの間だけ色を付ける）
 */
export const GitHubItemRow = memo(function GitHubItemRow({
  item,
  selected,
  fresh = false,
  chats,
  onOpen,
}: {
  item: GitHubItem;
  selected: boolean;
  fresh?: boolean;
  chats?: Chat[];
  onOpen: (item: GitHubItem) => void;
}) {
  return (
    <div className="github-item-wrap">
    <button type="button" className={cx("github-item", selected && "selected", fresh && "fresh")} aria-current={selected || undefined} onClick={() => onOpen(item)}>
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
          {item.assignees.length > 0 && <span className="github-item-assignees">担当 {item.assignees.map((a) => a.login).join("、")}</span>}
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
    {chats && chats.length > 0 && (
      <button
        type="button"
        className="github-item-chats"
        data-tip={`結び付いたチャット: ${chats.map((c) => chatTitle(c.title)).join("、")}（押すと「${chatTitle(chats[0].title)}」を開く）`}
        onClick={() => openChat(chats[0].project_id, chats[0].id)}
      >
        <MessagesSquare size={12} aria-hidden />
        {chats.length > 1 ? chats.length : "チャット"}
      </button>
    )}
    </div>
  );
});
