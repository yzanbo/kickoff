import { createContext, useContext, useState } from "react";
import { ChevronDown, ChevronRight, GitCommitHorizontal } from "lucide-react";
import type { GitHubReviewThread, GitHubTimelineEntry, GitHubUser } from "@shared/types";
import { cx } from "@/lib/cx";
import { agoText, formatFullStamp } from "@/lib/time";
import { GitHubHtml } from "./GitHubHtml";
import { GitHubThreadActions } from "./GitHubThreadActions";

/** GitHub のユーザーの顔と名前 */
export function GitHubAuthor({ user }: { user: GitHubUser | null }) {
  return (
    <span className="github-author">
      {user?.avatar_url ? <img className="github-avatar" src={user.avatar_url} alt="" width={20} height={20} /> : <span className="github-avatar empty" aria-hidden />}
      <span className="github-author-name">{user?.login ?? "（消えたユーザー）"}</span>
    </span>
  );
}

/** いつ（乗せると日時） */
export function GitHubTime({ iso }: { iso: string }) {
  if (!iso) return null;
  return (
    <time className="github-time muted" dateTime={iso} data-tip={formatFullStamp(iso)}>
      {agoText(iso)}
    </time>
  );
}

const REVIEW_TEXT: Record<string, string> = {
  approved: "承認しました",
  changes_requested: "変更を依頼しました",
  commented: "レビューしました",
  dismissed: "レビューを取り下げました",
  pending: "レビューを書いています",
};

/** スレッドごとの「AI に渡す」（PR の中身が渡す。そのスレッドだけでレビューコメントで直す。ないところでは出さない） */
export const ThreadHandoffContext = createContext<((thread: GitHubReviewThread) => void) | null>(null);

/**
 * 行のスレッド 1 つ（ファイルと行・解決済み・古い差分の印・差分の終わりの数行・コメント・返信と解決（PR の中身の中だけ））。
 * 解決済みのものは畳んでおき（見出しとコメントの数だけ）、見出しの ▸ で開く。解決を戻した・解決したら、また既定の開き方に戻す（仕様書 8）。
 * inline は PR の「変更」の差分の行の下に出すとき（ファイルと差分の数行は差分そのものが見えているので出さない）
 */
export function GitHubThread({ thread, inline = false }: { thread: GitHubReviewThread; inline?: boolean }) {
  const line = thread.line ?? thread.original_line;
  const handoff = useContext(ThreadHandoffContext);
  // 手で開け閉めした覚え（解決済みかが変わったら捨てる）
  const [manual, setManual] = useState<{ resolved: boolean; open: boolean } | null>(null);
  const open = manual && manual.resolved === thread.resolved ? manual.open : !thread.resolved;
  const Chevron = open ? ChevronDown : ChevronRight;
  const toggle = thread.resolved && (
    <button
      type="button"
      className="github-thread-toggle"
      aria-expanded={open}
      aria-label={open ? "スレッドを畳む" : "スレッドを開く"}
      onClick={() => setManual({ resolved: thread.resolved, open: !open })}
    >
      <Chevron size={13} aria-hidden />
    </button>
  );
  const hunk = inline ? "" : (thread.comments[0]?.diff_hunk.split("\n").slice(-4).join("\n") ?? "");
  const badges = (
    <>
      {thread.resolved && <span className="github-thread-badge">解決済み</span>}
      {!open && <span className="github-thread-count muted">コメント {thread.comments.length} 件</span>}
      {thread.outdated && <span className="github-thread-badge">古い差分</span>}
      {handoff && !thread.resolved && (
        <button
          type="button"
          className="link-button small github-thread-handoff"
          data-tip="このスレッドのコメントを、PR のブランチで作業するチャットの入力欄に入れる（なければ新しいチャット）"
          onClick={() => handoff(thread)}
        >
          AI に渡す
        </button>
      )}
    </>
  );
  return (
    <div className={cx("github-thread", thread.resolved && "resolved", inline && "inline", !open && "collapsed")}>
      {!inline ? (
        <div className="github-thread-head">
          {toggle}
          <span className="github-thread-path">
            {thread.path}
            {line !== null && `:${line}`}
          </span>
          {badges}
        </div>
      ) : (
        (thread.resolved || thread.outdated || handoff) && (
          <div className="github-thread-head">
            {toggle}
            {badges}
          </div>
        )
      )}
      {open && hunk && <pre className="github-thread-hunk">{hunk}</pre>}
      {open && thread.comments.map((c) => (
        <div key={c.id} className="github-thread-comment">
          <div className="github-entry-head">
            <GitHubAuthor user={c.author} />
            <GitHubTime iso={c.created_at} />
          </div>
          <GitHubHtml html={c.body_html} empty="" />
        </div>
      ))}
      {open && <GitHubThreadActions thread={thread} />}
    </div>
  );
}

/** 出来事の流れの 1 つ */
function Entry({ entry, threads }: { entry: GitHubTimelineEntry; threads: Map<string, GitHubReviewThread> }) {
  switch (entry.type) {
    case "comment":
      return (
        <article className="github-entry github-comment">
          <div className="github-entry-head">
            <GitHubAuthor user={entry.author} />
            <GitHubTime iso={entry.created_at} />
          </div>
          <GitHubHtml html={entry.body_html} empty="（本文なし）" />
        </article>
      );
    case "review": {
      const own = entry.thread_ids.map((id) => threads.get(id)).filter((t): t is GitHubReviewThread => t !== undefined);
      return (
        <article className={cx("github-entry github-review-entry", `github-review-${entry.state}`)}>
          <div className="github-entry-head">
            <GitHubAuthor user={entry.author} />
            <span className="github-review-state">{REVIEW_TEXT[entry.state] ?? "レビューしました"}</span>
            <GitHubTime iso={entry.created_at} />
          </div>
          {entry.body_html.trim() && <GitHubHtml html={entry.body_html} />}
          {own.map((t) => (
            <GitHubThread key={t.id} thread={t} />
          ))}
        </article>
      );
    }
    case "commits":
      return (
        <div className="github-entry github-commits">
          <div className="github-event-line">
            <GitCommitHorizontal size={14} aria-hidden />
            <span>
              {entry.author?.login ?? "誰か"} が {entry.commits.length} 件のコミットを足しました
            </span>
            <GitHubTime iso={entry.created_at} />
          </div>
          <ul className="github-commit-list">
            {entry.commits.map((c) => (
              <li key={c.oid}>
                <code>{c.oid.slice(0, 7)}</code> {c.message}
              </li>
            ))}
          </ul>
        </div>
      );
    case "event":
      return (
        <div className="github-entry github-event-line">
          <span className="github-event-dot" aria-hidden />
          <span>
            <b>{entry.actor?.login ?? "誰か"}</b> が{entry.text}
          </span>
          <GitHubTime iso={entry.created_at} />
        </div>
      );
  }
}

/** issue・PR の会話の流れ（コメント・レビューと行のスレッド・コミット・出来事） */
export function GitHubTimeline({ entries, threads = [], truncated }: { entries: GitHubTimelineEntry[]; threads?: GitHubReviewThread[]; truncated: boolean }) {
  const byId = new Map(threads.map((t) => [t.id, t]));
  return (
    <div className="github-timeline">
      {entries.map((e) => (
        <Entry key={e.id} entry={e} threads={byId} />
      ))}
      {truncated && <p className="muted small">出来事が多いので、初めの 300 件までを出しています。続きは GitHub で見てください。</p>}
    </div>
  );
}
