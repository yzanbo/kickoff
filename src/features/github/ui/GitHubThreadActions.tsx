import "./GitHubThreadActions.css";
import { useState } from "react";
import type { GitHubReviewThread } from "@shared/github/types";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { useGitHubDetailContext } from "./githubDetailContext";
import { GitHubMarkdownField } from "./GitHubMarkdownField";

/** スレッドの下の「返信」（押すと書く欄を開く）と「解決済みにする / 解決を戻す」（どちらもそのアカウントにできるときだけ）。PR の中身の外（渡されていない所）では出さない */
export function GitHubThreadActions({ thread }: { thread: GitHubReviewThread }) {
  const actions = useGitHubDetailContext().threadActions;
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const action = useAction<"reply" | "resolve">();
  if (!actions || (!thread.can_reply && !thread.can_resolve)) return null;
  const busy = action.busy !== null;
  const send = () =>
    text.trim() &&
    !busy &&
    void action.run("reply", async () => {
      await actions.reply(thread, text);
      setText("");
      setWriting(false);
    });
  return (
    <div className="github-thread-actions">
      {writing && (
        <GitHubMarkdownField value={text} onChange={setText} label="返信" placeholder="返信を書く（Markdown。⌘Enter で送る）" onSubmit={send} disabled={busy} autoFocus minRows={2} />
      )}
      <ErrorText message={action.error} />
      <div className="github-thread-buttons">
        {!thread.can_reply ? null : writing ? (
          <>
            <button type="button" className="btn" data-size="sm" disabled={busy} onClick={() => setWriting(false)}>
              やめる
            </button>
            <button type="button" className="btn btn-primary" data-size="sm" disabled={!text.trim() || busy} onClick={send}>
              {action.busy === "reply" ? "送っています…" : "返信する"}
            </button>
          </>
        ) : (
          <button type="button" className="btn" data-size="sm" onClick={() => setWriting(true)}>
            返信
          </button>
        )}
        {thread.can_resolve && (
          <button type="button" className="btn" data-size="sm" disabled={busy} onClick={() => void action.run("resolve", () => actions.resolve(thread, !thread.resolved))}>
            {action.busy === "resolve" ? "変えています…" : thread.resolved ? "解決を戻す" : "解決済みにする"}
          </button>
        )}
      </div>
    </div>
  );
}
