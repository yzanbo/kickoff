import { useState } from "react";
import type { GitCommit } from "@shared/types";
import { cx } from "@/lib/cx";
import { useDragSize } from "@/hooks/useDragSize";
import { CHANGES_LIST_WIDTH } from "@/lib/storageKeys";
import { WorktreePicker } from "@/features/worktree/WorktreePicker";
import { ErrorText } from "@/ui/ErrorText";
import { HistoryMain } from "./HistoryMain";
import { HistorySidebar } from "./HistoryView";
import { useGitLog } from "./useGitLog";
import type { GitStatusController } from "@/features/editor/useGitStatus";
import { GitInitNotice } from "@/features/project/GitInitNotice";
import { useContextMenu } from "@/ui/useContextMenu";
import { RefMenu } from "./RefMenu";
import type { RefTarget } from "./refTarget";
import { useBranchActions } from "./useBranchActions";

/**
 * プロジェクトの「履歴」タブ（Fork と同じ形: 左にブランチ・リモート・ワークツリーなどの一覧、右上にコミットの表、右下に詳細）。
 * ボード・ファイル・変更と並ぶタブ。上の WorktreePicker で見る作業場所を切り替える（ファイル・検索・変更のタブと同じ作業場所）。
 * ブランチ・タグの右クリックで、チェックアウト・プッシュ・マージなどの操作（RefMenu ＋ useBranchActions）
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
  // 左の一覧の幅（右端のつまみをドラッグで変える。ダブルクリックで元に戻す。ファイルタブの一覧と同じ幅を覚える）
  const list = useDragSize({ setting: CHANGES_LIST_WIDTH, min: 200, keep: 320 });
  // ブランチ・タグの右クリック（左の一覧とコミットの札で同じメニュー）
  const branchActions = useBranchActions(projectId, log, git, onWorktreeChange);
  const refMenu = useContextMenu<RefTarget>();

  if (!status) {
    return git.error ? <ErrorText message={git.error} /> : <p className="muted small">読み込み中…</p>;
  }
  if (!status.repo) return <GitInitNotice projectId={projectId} onStarted={git.refresh} />;

  return (
    <>
      {/* 作業場所（本体・ワークツリー）の切り替え。ワークツリーが本体だけなら空（CSS で隠す） */}
      <div className="changes-bar">
        <WorktreePicker projectId={projectId} value={worktree} onChange={onWorktreeChange} version={git.version} />
      </div>
      <div className={cx("changes", list.resizing && "resizing")}>
        <aside ref={list.paneRef} className="changes-list" style={{ width: list.size }} aria-label="履歴">
          <HistorySidebar
            projectId={projectId}
            log={log}
            busy={branchActions.busy}
            onRefMenu={refMenu.open}
            onPick={(hash) => {
              const found = log.commits?.find((c) => c.hash === hash);
              if (found) setCommit(found);
            }}
          />
        </aside>
        <div className="pane-resizer" aria-label="一覧の幅を変える" {...list.handle} />
        <div className="changes-diff">
          <HistoryMain projectId={projectId} log={log} commit={commit} onSelect={setCommit} onRefMenu={refMenu.open} />
        </div>
      </div>
      {refMenu.menu && <RefMenu at={refMenu.menu.at} target={refMenu.menu.value} refs={log.refs} actions={branchActions} onClose={refMenu.close} />}
    </>
  );
}
