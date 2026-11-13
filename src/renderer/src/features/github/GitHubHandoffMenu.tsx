import { Wrench } from "lucide-react";
import type { GitHubIssueDetail, GitHubPullDetail } from "@shared/types";
import { api } from "@/api";
import { MenuItem } from "@/ui/PopupMenu";
import type { HandOffItem } from "@/features/chat/handoff/handOff";
import { HandOffButton } from "@/features/chat/handoff/HandOffMenu";
import { fixReviewComments } from "./githubHandoff";
import { captureNameOf, handOffText, itemDocument, linkOf, sourceOf, worktreeBranchOf } from "./githubPrompt";

const isPull = (d: GitHubIssueDetail): d is GitHubPullDetail => d.item.kind === "pr";

/** issue・PR を渡すもの（一言と、押した時点の題名・本文・コメントの札。新しいチャットは作業場所を選ぶ） */
function handOffItemOf(projectId: number, detail: GitHubIssueDetail | GitHubPullDetail): HandOffItem {
  const kind = detail.item.kind === "pr" ? "pr" : "issue";
  return {
    projectId,
    what: `${kind === "pr" ? "PR" : "issue"} #${detail.item.number} の題名・本文・コメント`,
    text: handOffText(detail),
    capture: () => api.capture({ name: captureNameOf(detail), mime: "text/markdown", text: itemDocument(detail), source: sourceOf(detail) }),
    link: linkOf(detail),
    branch: worktreeBranchOf(detail),
  };
}

/**
 * 中身の見出しの「AI に渡す ▾」: 共通の 4 つの渡し先（新しいチャットで始める・このチャットに追加・新しい子チャットで聞く・ほかのチャットに追加）と、
 * PR は「レビューコメントで直す」（解決していない行のコメント）。どれも入力欄に入れるだけで、送るのは自分で
 */
export function GitHubHandoffMenu({ projectId, detail }: { projectId: number; detail: GitHubIssueDetail | GitHubPullDetail }) {
  const unresolved = isPull(detail) ? detail.review_threads.filter((t) => !t.resolved).length : 0;
  const extra = isPull(detail) && (
    <>
      <div className="menu-separator" role="separator" />
      <MenuItem
        disabled={unresolved === 0}
        title={
          unresolved === 0
            ? "解決していない行のコメントはありません"
            : "PR のブランチのワークツリー（なければ作る）で作業しているチャットの入力欄に、解決していない行のコメントの札を入れる（チャットがなければ新しく始める）"
        }
        onSelect={() => void fixReviewComments(projectId, detail, linkOf(detail))}
      >
        <Wrench size={14} /> レビューコメントで直す{unresolved > 0 ? `（${unresolved}）` : ""}
      </MenuItem>
    </>
  );
  return <HandOffButton item={handOffItemOf(projectId, detail)} extra={extra} className="github-handoff-button" />;
}
