import { memo, type CSSProperties } from "react";
import { Check, CircleDashed, MessageSquare, MessagesSquare, X, type LucideIcon } from "lucide-react";
import type { Chat } from "@shared/chat/types";
import type { CiState } from "@shared/github/ciTypes";
import type { GitHubItem, GitHubLabel, GitHubReviewDecision } from "@shared/github/types";
import { open } from "@/foundation/ui/navigation/open";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { cx } from "@/foundation/ui/lib/cx";
import { relativeTime } from "@/foundation/ui/lib/time";
import { GitHubStateIcon } from "./GitHubStateIcon";

/** ラベルの札（GitHub の色の点 ＋ 名前） */
export function GitHubLabels({ labels }: { labels: GitHubLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="github-labels">
      {labels.map((l) => (
        <span key={l.name} className="github-label tag" data-look="outline" style={{ "--label-color": `#${l.color}` } as CSSProperties}>
          {l.name}
        </span>
      ))}
    </span>
  );
}

/** まとめの成否の印（まとめに出るのは通った・落ちた・途中だけ） */
const CHECKS_MARK: Partial<Record<CiState, { text: string; Icon: LucideIcon }>> = {
  success: { text: "チェックが通った", Icon: Check },
  failure: { text: "チェックが落ちた", Icon: X },
  pending: { text: "チェックの途中", Icon: CircleDashed },
};

/** CI の成否の印（PR の一覧・中身） */
function GitHubChecksMark({ state }: { state: CiState | null }) {
  const mark = state ? CHECKS_MARK[state] : undefined;
  if (!mark) return null;
  return <mark.Icon size={13} className="github-checks" data-ci={state} aria-label={mark.text} data-tip={mark.text} />;
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
          <span>更新 {relativeTime(item.updated_at, { style: "ago" })}</span>
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
        className="github-item-chats tag"
        data-look="outline"
        data-tip={`結び付いたチャット: ${chats.map((c) => chatTitle(c.title)).join("、")}（押すと「${chatTitle(chats[0].title)}」を開く）`}
        onClick={() => open({ kind: "chat", projectId: chats[0].project_id, chatId: chats[0].id })}
      >
        <MessagesSquare size={12} aria-hidden />
        {chats.length > 1 ? chats.length : "チャット"}
      </button>
    )}
    </div>
  );
});
