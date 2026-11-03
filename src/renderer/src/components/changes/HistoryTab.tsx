import { useState } from "react";
import type { GitCommit } from "../../../../core/types";
import { cx } from "../../cx";
import { useDragWidth } from "../../hooks/useDragWidth";
import { CHANGES_LIST_WIDTH_KEY } from "../../storageKeys";
import { WorktreePicker } from "../../worktree/WorktreePicker";
import { ErrorText } from "../ErrorText";
import { HistoryMain } from "./HistoryMain";
import { HistorySidebar } from "./HistoryView";
import { useGitLog } from "./useGitLog";
import type { GitStatusController } from "./useGitStatus";

/**
 * プロジェクトの「履歴」タブ（Fork と同じ形: 左にブランチ・リモート・ワークツリーなどの一覧、右上にコミットの表、右下に詳細）。
 * ボード・エディタと並ぶタブ。上の WorktreePicker で見る作業場所を切り替える（エディタと同じ作業場所）
 */
export function HistoryTab({
  projectId,
  git,
  worktree,
  onWorktreeChange,
}: {
  projectId: number;
  git: GitStatusController;
  /** 見ている作業場所（ワークツリーのフォルダ。undefined なら本体） */
  worktree?: string;
  onWorktreeChange: (worktree: string | undefined) => void;
}) {
  const { status } = git;
  const log = useGitLog(projectId, Boolean(status?.repo), git.version);
  const [picked, setPicked] = useState<{ projectId: number; commit: GitCommit }>();
  // 別のプロジェクトに切り替えたら、選んでいたコミットは外す（ほかのリポジトリにはない）
  const commit = picked?.projectId === projectId ? picked.commit : undefined;
  const setCommit = (next: GitCommit) => setPicked({ projectId, commit: next });
  // 左の一覧の幅（右端のつまみをドラッグで変える。ダブルクリックで元に戻す。エディタタブの一覧と同じ幅を覚える）
  const list = useDragWidth({ storageKey: CHANGES_LIST_WIDTH_KEY, initial: 246 });

  if (!status) {
    return git.error ? <ErrorText message={git.error} /> : <p className="muted small">読み込み中…</p>;
  }
  if (!status.repo) return <p className="muted small">このプロジェクトのフォルダは、Git で管理されていません。</p>;

  return (
    <>
      {/* 作業場所（本体・ワークツリー）の切り替え。ワークツリーが本体だけなら空（CSS で隠す） */}
      <div className="changes-bar">
        <WorktreePicker projectId={projectId} value={worktree} onChange={onWorktreeChange} version={git.version} />
      </div>
      <div className={cx("changes", list.resizing && "resizing")}>
        <aside ref={list.paneRef} className="changes-list" style={{ width: list.width }} aria-label="履歴">
          <HistorySidebar
            projectId={projectId}
            log={log}
            onPick={(hash) => {
              const found = log.commits?.find((c) => c.hash === hash);
              if (found) setCommit(found);
            }}
          />
        </aside>
        <div className="pane-resizer" aria-label="一覧の幅を変える" {...list.handle} />
        <div className="changes-diff">
          <HistoryMain projectId={projectId} log={log} commit={commit} onSelect={setCommit} />
        </div>
      </div>
    </>
  );
}
