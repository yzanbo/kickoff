// 中身の見出しの札: PR のマージできるか（衝突・保護ルール）と承認の数、issue を閉じる PR（仕様書 7・8）
import { Check, CircleDashed, TriangleAlert } from "lucide-react";
import { GITHUB_MERGE_STATE_LABELS, type GitHubLinkedPull, type GitHubMergeState, type GitHubPullDetail } from "@shared/types";
import { GitHubStateIcon } from "./GitHubStateIcon";
import { selectGitHubItem } from "./GitHubLinkChip";

/** マージの様子の色（clean・フックあり = 通る / まだ分からない = 薄く / ほかは止まっている） */
const toneOf = (state: GitHubMergeState): "ok" | "wait" | "warn" => (state === "clean" || state === "has_hooks" ? "ok" : state === "unknown" ? "wait" : "warn");

/** PR のマージできるか（開いている PR だけ。下書きは状態の札で分かるので出さない）と承認の数 */
export function GitHubMergeBadges({ detail }: { detail: GitHubPullDetail }) {
  const open = detail.item.state === "open" && detail.merge_state !== "draft";
  const tone = toneOf(detail.merge_state);
  const Icon = tone === "ok" ? Check : tone === "wait" ? CircleDashed : TriangleAlert;
  return (
    <>
      {open && (
        <span className={`github-merge-state github-merge-state-${tone} small`}>
          <Icon size={13} aria-hidden />
          {GITHUB_MERGE_STATE_LABELS[detail.merge_state]}
        </span>
      )}
      <span className={`github-approvals small${detail.approvals > 0 ? " has" : " muted"}`} data-tip="人ごとのいちばん新しいレビューが承認のもの">
        承認 {detail.approvals}
      </span>
    </>
  );
}

/** issue を閉じる PR（押すと Kickoff の中でその PR を開く） */
export function GitHubLinkedPulls({ projectId, pulls }: { projectId: number; pulls: GitHubLinkedPull[] }) {
  if (pulls.length === 0) return null;
  return (
    <span className="github-linked-pulls small">
      <span className="muted">結び付いた PR:</span>
      {pulls.map((p) => (
        <button key={p.number} type="button" className="github-linked-pull" onClick={() => selectGitHubItem(projectId, { kind: "pr", number: p.number })} data-tip={p.title}>
          <GitHubStateIcon item={{ kind: "pr", state: p.state, state_reason: null, is_draft: p.is_draft }} size={13} />#{p.number}
        </button>
      ))}
    </span>
  );
}
