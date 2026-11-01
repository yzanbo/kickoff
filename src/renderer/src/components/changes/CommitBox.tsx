import { ArrowDown, ArrowUp, Check, UploadCloud } from "lucide-react";
import { useState } from "react";
import type { GitStatus } from "../../../../core/types";
import { confirmDialog } from "../../dialogs";
import type { GitStatusController } from "./useGitStatus";

/**
 * 「変更」の上のコミットの欄（VS Code と同じ）。メッセージを書いて「コミット」（⌘Enter）。
 * ステージしたものがなければ、すべてステージしてコミットするか確かめる。リモートより進んでいれば「プッシュ」、
 * 追いかけるブランチがまだなければ「ブランチを公開」を出す
 */
export function CommitBox({
  status,
  git,
  guard,
}: {
  status: Extract<GitStatus, { repo: true }>;
  git: GitStatusController;
  /** 失敗を一覧の上に出す（useActionError の guard） */
  guard: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"commit" | "push" | "pull">();
  const changes = [...status.conflicts, ...status.unstaged];
  const canCommit = status.staged.length > 0 || changes.length > 0;

  const commit = async () => {
    if (busy || !canCommit) return;
    if (!message.trim()) return void guard(() => Promise.reject(new Error("コミットのメッセージを入れてください")));
    const stageAll = status.staged.length === 0;
    if (
      stageAll &&
      !(await confirmDialog({
        title: "ステージした変更がありません",
        message: "すべての変更をステージしてコミットしますか？",
        confirmLabel: "すべてステージしてコミット",
      }))
    )
      return;
    setBusy("commit");
    await guard(async () => {
      if (stageAll) await git.act("stage", changes.map((f) => f.path));
      await git.commit(message);
      setMessage("");
    });
    setBusy(undefined);
  };

  const push = async () => {
    if (busy) return;
    setBusy("push");
    await guard(() => git.push());
    setBusy(undefined);
  };

  // リモートより遅れていれば、早送りで取り込む（GitHub でマージした PR を手元に入れるときなど）
  const pull = async () => {
    if (busy) return;
    setBusy("pull");
    await guard(() => git.pull());
    setBusy(undefined);
  };

  // プッシュするもの: 進んでいるコミット、またはまだ公開していないブランチ（origin があるとき）
  const publish = !status.upstream && status.hasOrigin && status.branch !== null;
  return (
    <div className="commit-box">
      <textarea
        className="commit-message"
        rows={2}
        placeholder={`メッセージ（⌘Enter で ${status.branch ?? "いまのブランチ"} にコミット）`}
        aria-label="コミットのメッセージ"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.metaKey) {
            e.preventDefault();
            void commit();
          }
        }}
      />
      <button className="btn btn-primary commit-button" disabled={Boolean(busy) || !canCommit} onClick={() => void commit()}>
        <Check size={14} aria-hidden /> {busy === "commit" ? "コミット中…" : "コミット"}
      </button>
      {status.behind > 0 && (
        <button className="btn commit-button" disabled={Boolean(busy)} onClick={() => void pull()}>
          <ArrowDown size={14} aria-hidden /> {busy === "pull" ? "プル中…" : `プル（${status.behind} 件）`}
        </button>
      )}
      {(status.ahead > 0 || publish) && (
        <button className="btn commit-button" disabled={Boolean(busy)} onClick={() => void push()}>
          {publish ? <UploadCloud size={14} aria-hidden /> : <ArrowUp size={14} aria-hidden />}
          {busy === "push" ? "プッシュ中…" : publish ? "ブランチを公開" : `プッシュ（${status.ahead} 件）`}
        </button>
      )}
    </div>
  );
}
