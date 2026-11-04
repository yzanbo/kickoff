import { ArrowDown, ArrowUp, Check, UploadCloud } from "lucide-react";
import { useState } from "react";
import type { GitStatus } from "@shared/types";
import type { ActionState } from "@/hooks/useAction";
import { confirmDialog } from "@/ui/dialogs";
import type { GitStatusController } from "./useGitStatus";

/** コミットの欄の操作（実行中は、ほかの操作のボタンも押せなくする） */
export type CommitBusy = "commit" | "push" | "pull";

/**
 * 「変更」の上のコミットの欄（VS Code と同じ）。メッセージを書いて「コミット」（⌘Enter）。
 * ステージしたものがなければ、すべてステージしてコミットするか確かめる。リモートより進んでいれば「プッシュ」、
 * 追いかけるブランチがまだなければ「ブランチを公開」を出す
 */
export function CommitBox({
  status,
  git,
  action,
}: {
  status: Extract<GitStatus, { repo: true }>;
  git: GitStatusController;
  /** 実行中と失敗（失敗は一覧の上に出す。親の useAction） */
  action: ActionState<CommitBusy>;
}) {
  const [message, setMessage] = useState("");
  const { busy } = action;
  const changes = [...status.conflicts, ...status.unstaged];
  const canCommit = status.staged.length > 0 || changes.length > 0;

  const commit = async () => {
    if (busy || !canCommit) return;
    if (!message.trim()) return action.setError("コミットのメッセージを入れてください");
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
    await action.run("commit", async () => {
      if (stageAll) await git.act("stage", changes.map((f) => f.path));
      await git.commit(message);
      setMessage("");
    });
  };

  const push = async () => {
    if (!busy) await action.run("push", () => git.push());
  };

  // リモートより遅れていれば、早送りで取り込む（GitHub でマージした PR を手元に入れるときなど）
  const pull = async () => {
    if (!busy) await action.run("pull", () => git.pull());
  };

  // プッシュするもの: 進んでいるコミット、またはまだ公開していないブランチ（origin があるとき）
  const publish = !status.upstream && status.has_origin && status.branch !== null;
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
