import { createContext, useContext, useState } from "react";
import type { GitHubReviewThread } from "@shared/types";
import { useAction } from "@/hooks/useAction";
import { ErrorText } from "@/ui/ErrorText";
import { GitHubMarkdownField } from "./GitHubMarkdownField";

/** 行のスレッドへの返信と解決（PR の中身が渡す。返信・解決済みにするのは人。要件 5.11 の段階 3・決定 ⑥） */
export interface ThreadActions {
  reply: (thread: GitHubReviewThread, body: string) => Promise<void>;
  resolve: (thread: GitHubReviewThread, resolved: boolean) => Promise<void>;
}

export const ThreadActionsContext = createContext<ThreadActions | null>(null);

/** スレッドの下の「返信」（押すと書く欄を開く）と「解決済みにする / 解決を戻す」（どちらもそのアカウントにできるときだけ）。PR の中身の外（渡されていない所）では出さない */
export function GitHubThreadActions({ thread }: { thread: GitHubReviewThread }) {
  const actions = useContext(ThreadActionsContext);
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
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setWriting(false)}>
              やめる
            </button>
            <button type="button" className="btn btn-sm btn-primary" disabled={!text.trim() || busy} onClick={send}>
              {action.busy === "reply" ? "送っています…" : "返信する"}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => setWriting(true)}>
            返信
          </button>
        )}
        {thread.can_resolve && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void action.run("resolve", () => actions.resolve(thread, !thread.resolved))}>
            {action.busy === "resolve" ? "変えています…" : thread.resolved ? "解決を戻す" : "解決済みにする"}
          </button>
        )}
      </div>
    </div>
  );
}
