import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { GITHUB_REVIEW_EVENTS, GITHUB_REVIEW_EVENT_LABELS, type GitHubReviewDraftComment, type GitHubReviewEvent } from "@shared/types";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { useSetting } from "@/hooks/useSetting";
import { githubReviewDraft } from "@/lib/storageKeys";
import { EMPTY_REVIEW_DRAFT } from "@/lib/githubReviewDraft";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { Markdown } from "@/ui/markdown/Markdown";
import { GitHubMarkdownField } from "./GitHubMarkdownField";
import { targetLabel, type ReviewTarget } from "./reviewLines";

/** PR のレビューの書きかけ（ためた行のコメントと本文。プロジェクトと PR ごとに画面の保存へ。アプリを閉じても残り、送ったら消える） */
export function useReviewDraft(projectId: number, number: number) {
  return useSetting(githubReviewDraft(`${projectId}:${number}`));
}

/**
 * 「変更」の上のレビューの帯（要件 5.11 の段階 3）: ためた行のコメントの数と「レビューを書く」。開くと本文（Markdown）と、送り方（コメント / 承認 / 変更依頼）。
 * 行のコメントもまとめて 1 回で送り（GitHub と同じ）、見ていた最新のコミット（head_sha）に付ける。送ったら書きかけを消して onSent（中身を取り直す）
 */
export function GitHubReviewBar({
  projectId,
  number,
  headSha,
  onSent,
  lead,
}: {
  projectId: number;
  number: number;
  headSha: string | null;
  onSent: () => void;
  /** 行の頭に置くもの（「変更」のファイルの木の開閉） */
  lead?: ReactNode;
}) {
  const [draft, setDraft] = useReviewDraft(projectId, number);
  const [open, setOpen] = useState(false);
  const action = useAction<GitHubReviewEvent>();
  const count = draft.comments.length;
  const send = (event: GitHubReviewEvent) =>
    void action.run(event, async () => {
      await api.githubReview(projectId, number, { event, body: draft.body, comments: draft.comments, commit_id: headSha });
      setDraft(EMPTY_REVIEW_DRAFT);
      setOpen(false);
      onSent();
    });
  return (
    <section className="github-review-bar" aria-label="レビュー">
      <div className="github-review-bar-row">
        {lead}
        <span className="muted small">
          {count > 0 ? `行のコメント ${count} 件をためています（まだ送っていません）` : "差分の行を右クリックすると、レビューの行のコメントを書けます"}
        </span>
        <span className="github-detail-spacer" />
        <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "レビューを書く"}
        </button>
      </div>
      {open && (
        <div className="github-review-compose">
          <GitHubMarkdownField value={draft.body} onChange={(body) => setDraft({ ...draft, body })} label="レビューの本文" placeholder="全体へのコメント（Markdown。承認なら空でもよい）" minRows={3} />
          <ErrorText message={action.error} />
          <div className="github-comment-actions">
            {GITHUB_REVIEW_EVENTS.map((e) => (
              <button key={e} type="button" className={e === "approve" ? "btn btn-sm btn-primary" : "btn btn-sm"} disabled={action.busy !== null} onClick={() => send(e)}>
                {action.busy === e ? "送っています…" : `${GITHUB_REVIEW_EVENT_LABELS[e]}で送る`}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** 差分の行の下に開く、行のコメントを書く欄（「ためる」でレビューの書きかけに足す） */
export function ReviewCommentEditor({ target, onSave, onCancel }: { target: ReviewTarget; onSave: (body: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const save = () => text.trim() && onSave(text);
  return (
    <div className="github-review-editor">
      <span className="muted small">{targetLabel(target)}へのコメント</span>
      <GitHubMarkdownField value={text} onChange={setText} label="行のコメント" placeholder="この行へのコメント（Markdown。⌘Enter でためる）" onSubmit={save} autoFocus minRows={2} />
      <div className="github-comment-actions">
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!text.trim()} onClick={save}>
          レビューにためる
        </button>
      </div>
    </div>
  );
}

/** ためた行のコメント（まだ送っていない。消せる） */
export function ReviewDraftComment({ comment, onRemove }: { comment: GitHubReviewDraftComment; onRemove: () => void }) {
  return (
    <div className="github-review-draft">
      <div className="github-thread-head">
        <span className="github-thread-badge">下書き</span>
        <span className="muted small">{targetLabel(comment)}</span>
        <span className="github-detail-spacer" />
        <IconButton icon={Trash2} label="この行のコメントを消す" onClick={onRemove} />
      </div>
      <Markdown>{comment.body}</Markdown>
    </div>
  );
}
