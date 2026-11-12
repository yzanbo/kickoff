import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { GITHUB_CLOSE_REASONS, GITHUB_CLOSE_REASON_LABELS, type GitHubCloseReason, type GitHubIssueDetail } from "@shared/types";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { ErrorText } from "@/ui/ErrorText";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { GitHubMarkdownField } from "./GitHubMarkdownField";

/**
 * issue・PR の会話の下のコメント欄（要件 5.11 の段階 3）: Markdown で書いて「コメント」、書いた文があれば「コメントして閉じる」。
 * issue は閉じ方（完了 / 対応しない）を ▾ で選ぶ（ボタンそのものは完了）。閉じたものは「開き直す」。マージ済みの PR は閉じる・開き直すを出さない。
 * 閉じる・開き直す・ラベルは、そのアカウントにできるときだけ（GitHub の viewerCan…）。送ったら onChanged（中身を取り直す）
 */
export function GitHubCommentBox({ projectId, detail, onChanged }: { projectId: number; detail: GitHubIssueDetail; onChanged: () => void }) {
  const [text, setText] = useState("");
  const action = useAction<"comment" | "close" | "reopen">();
  const reasons = useContextMenu<null>();
  const { item, viewer } = detail;
  const isPr = item.kind === "pr";
  const what = isPr ? "PR" : "issue";
  const hasText = text.trim() !== "";
  const busy = action.busy !== null;

  // 書いた文があれば、先にコメントしてから
  const withComment = async (then?: () => Promise<void>) => {
    if (hasText) {
      await api.githubComment(projectId, item.number, text);
      setText("");
    }
    await then?.();
    onChanged();
  };
  const comment = () => hasText && !busy && void action.run("comment", () => withComment());
  const close = (reason: GitHubCloseReason) =>
    void action.run("close", () => withComment(() => api.githubSetState(projectId, item.kind, item.number, { state: "closed", reason: isPr ? null : reason })));
  const reopen = () => void action.run("reopen", () => withComment(() => api.githubSetState(projectId, item.kind, item.number, { state: "open", reason: null })));

  const canClose = item.state === "open" && viewer.can_close;
  const canReopen = item.state === "closed" && viewer.can_reopen;
  const closeLabel = hasText ? "コメントして閉じる" : `${what}を閉じる`;

  return (
    <section className="github-comment-box" aria-label="コメントを書く">
      <GitHubMarkdownField value={text} onChange={setText} label="コメント" placeholder="コメントを書く（Markdown。⌘Enter で送る）" onSubmit={comment} disabled={busy} />
      <ErrorText message={action.error} />
      <div className="github-comment-actions">
        {canClose &&
          (isPr ? (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => close("completed")}>
              {action.busy === "close" ? "閉じています…" : closeLabel}
            </button>
          ) : (
            <span className="github-split-button">
              <button type="button" className="btn btn-sm" disabled={busy} data-tip="完了として閉じる" onClick={() => close("completed")}>
                {action.busy === "close" ? "閉じています…" : closeLabel}
              </button>
              <button type="button" className="btn btn-sm github-split-toggle" disabled={busy} aria-label="閉じ方を選ぶ" aria-haspopup="menu" onClick={(e) => reasons.toggle(e, null)}>
                <ChevronDown size={13} aria-hidden />
              </button>
            </span>
          ))}
        {canReopen && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={reopen}>
            {action.busy === "reopen" ? "開き直しています…" : hasText ? "コメントして開き直す" : `${what}を開き直す`}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-primary" disabled={!hasText || busy} onClick={comment}>
          {action.busy === "comment" ? "送っています…" : "コメント"}
        </button>
      </div>
      {reasons.menu && (
        <PopupMenu at={reasons.menu.at} label="閉じ方" ignore=".github-split-toggle" onClose={reasons.close}>
          {GITHUB_CLOSE_REASONS.map((r) => (
            <MenuItem key={r} onSelect={() => close(r)}>
              {hasText ? `コメントして${GITHUB_CLOSE_REASON_LABELS[r]}` : GITHUB_CLOSE_REASON_LABELS[r]}
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </section>
  );
}
