import { useEffect, useEffectEvent, useState } from "react";
import type { GitCommit } from "@shared/git/types";
import { cx } from "@/foundation/ui/lib/cx";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { filesSettings } from "@/features/files/ui";
import { WorktreePicker } from "@/foundation/ui/workplace/WorktreePicker";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { HistoryMain } from "./HistoryMain";
import { HistorySidebar } from "./HistoryView";
import { useGitLog } from "./useGitLog";
import { useGitStatus } from "@/features/git/ui/useGitStatus";
import { GitInitNotice } from "@/features/projects/ui/GitInitNotice";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { RefMenu } from "./RefMenu";
import type { RefTarget } from "./refTarget";
import { useBranchActions } from "./useBranchActions";
import { useWorktreeActions } from "@/features/worktrees/ui/useWorktreeActions";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { HistoryToolbar } from "./HistoryToolbar";
import { useHistoryOps } from "./useHistoryOps";
import { useStashActions } from "./useStashActions";

/**
 * プロジェクトの「履歴」タブ（上に Git の操作の帯、左にブランチ・リモート・ワークツリーなどの一覧、右上にコミットの表、右下に詳細）。
 * ボード・ファイル・変更と並ぶタブ。帯の真ん中の WorktreePicker で見る作業場所を切り替える（ファイル・検索・変更のタブと同じ作業場所）。
 * ブランチ・タグの右クリックで、チェックアウト・プッシュ・マージなどの操作（RefMenu ＋ useBranchActions）、退避の右クリックで戻す・適用・削除（useStashActions）
 */
export function HistoryTab({
  projectId,
  worktree,
  onWorktreeChange,
}: {
  projectId: number;
  /** 見ている作業場所（ワークツリーのフォルダ。undefined なら本体） */
  worktree?: string;
  onWorktreeChange: (worktree: string | undefined) => void;
}) {
  // Git の状態（開いている間は一定の間隔でも取り直す。同じ作業場所の変更のタブのバッジとは同じ購読）
  const git = useGitStatus({ projectId, worktree: worktree ?? null }, { active: true });
  const { status } = git;
  const log = useGitLog(projectId, Boolean(status?.repo), git.version);
  const [picked, setPicked] = useState<{ projectId: number; commit: GitCommit }>();
  // 別のプロジェクトに切り替えたら、選んでいたコミットは外す（ほかのリポジトリにはない）
  const commit = picked?.projectId === projectId ? picked.commit : undefined;
  const setCommit = (next: GitCommit) => setPicked({ projectId, commit: next });
  // 左の一覧の幅（右端のつまみをドラッグで変える。ダブルクリックで元に戻す。ファイルタブの一覧と同じ幅を覚える）
  const { paneRef: listPaneRef, ...list } = useDragSize({ setting: filesSettings.listWidth, min: 200, keep: 320 });
  // ブランチ・タグの右クリック（左の一覧とコミットの札で同じメニュー）
  const branchActions = useBranchActions(projectId, log, git, onWorktreeChange);
  const refMenu = useContextMenu<RefTarget>();
  // ワークツリーの作成・削除（左の一覧の「ワークツリー」と、その行の右クリック）
  const worktreeActions = useWorktreeActions(projectId, log);
  const menuTree = refMenu.menu?.value.worktree ? log.worktrees?.find((w) => w.path === refMenu.menu?.value.worktree) : undefined;
  // 退避（帯の「退避」・左の一覧の退避の行の右クリック）と、帯の操作
  const stashActions = useStashActions(projectId, branchActions, log);
  const stashMenu = useContextMenu<string>();
  const ops = useHistoryOps({ projectId, worktree, git, log, branch: branchActions, stash: stashActions, worktreeActions });
  const { projectName } = useProjects();
  // 履歴を開いたら、裏でリモートの情報を取ってくる（ほかの人の push もすぐ札に出す。変更のタブから移ってきたときも。
  // 前の自動のフェッチから間がなければ飛ばす）。取ってきたら Git の状態と一緒に履歴も読み直す
  const autoFetchOnOpen = useEffectEvent(() => git.autoFetch());
  useEffect(() => {
    autoFetchOnOpen();
  }, []);

  if (!status) {
    return git.error ? <ErrorText message={git.error} /> : <p className="muted small">読み込み中…</p>;
  }
  if (!status.repo) return <GitInitNotice projectId={projectId} onStarted={git.refresh} />;

  return (
    <>
      {/* Git の操作の帯。真ん中に作業場所（本体・ワークツリー）の切り替え（ワークツリーが本体だけなら出さない） */}
      <HistoryToolbar
        ops={ops}
        projectName={projectName(projectId)}
        worktreePicker={<WorktreePicker projectId={projectId} value={worktree} onChange={onWorktreeChange} version={git.version} />}
      />
      <div className={cx("changes", list.resizing && "resizing")}>
        {!ops.listHidden && (
          <>
            <aside ref={listPaneRef} className="changes-list" style={{ width: list.size }} aria-label="履歴">
              <HistorySidebar
                log={log}
                busy={ops.busy}
                worktreeActions={worktreeActions}
                selectedHash={commit?.hash}
                onRefMenu={refMenu.open}
                onStashMenu={stashMenu.open}
                onPick={(hash) => {
                  const found = log.commits?.find((c) => c.hash === hash);
                  if (found) setCommit(found);
                }}
              />
            </aside>
            <div className="pane-resizer" aria-label="一覧の幅を変える" {...list.handle} />
          </>
        )}
        <div className="changes-diff">
          <HistoryMain projectId={projectId} log={log} commit={commit} onSelect={setCommit} onRefMenu={refMenu.open} />
        </div>
      </div>
      {refMenu.menu && (
        <RefMenu
          at={refMenu.menu.at}
          target={refMenu.menu.value}
          refs={log.refs}
          actions={branchActions}
          worktree={
            menuTree && {
              tree: menuTree,
              viewing: menuTree.path === worktree,
              onShow: () => onWorktreeChange(menuTree.path),
              onRemove: () => void worktreeActions.removeWorktree(menuTree),
            }
          }
          onClose={refMenu.close}
        />
      )}
      {stashMenu.menu && (
        <PopupMenu at={stashMenu.menu.at} label="退避のメニュー" onClose={stashMenu.close}>
          <MenuItem title="作業場所に戻して、退避の一覧から消します" onSelect={() => void stashActions.pop(stashMenu.menu!.value)}>
            戻す
          </MenuItem>
          <MenuItem title="作業場所に戻し、退避の一覧にも残します" onSelect={() => void stashActions.apply(stashMenu.menu!.value)}>
            適用
          </MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem danger onSelect={() => void stashActions.drop(stashMenu.menu!.value)}>
            削除…
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
