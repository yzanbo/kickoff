import { ArrowDown, ArrowUp, Check, ChevronsDownUp, ChevronsUpDown, Ellipsis, GitBranch, List, ListTree, Minus, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { GitStatus } from "@shared/types";
import type { ActionState } from "@/hooks/useAction";
import { useSetting } from "@/hooks/useSetting";
import { CHANGES_TREE } from "@/lib/storageKeys";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { ChangeGroup, OPEN_FOLD, type ChangeFold, type GitAction } from "./ChangeGroup";
import { CommitBox } from "./CommitBox";
import { useCommitActions, type CommitBusy } from "./useCommitActions";
import { OperationBanner } from "./OperationBanner";
import { buildTree, folderPaths } from "./treeModel";
import type { ChangeGroups, Selection } from "./fileSelection";
import type { FileRename } from "./useFileActions";
import type { GitStatusController } from "./useGitStatus";

/**
 * ファイルタブの左の「変更」（ソース管理）: 見出しの左にブランチと進み・遅れ、右に VS Code のソース管理の見出しと同じボタン
 * （コミット ✓・取り直す・ツリー / 一覧で表示・「…」のメニュー（プル・プッシュ・フェッチ・すべてステージ / ステージを取り消す・
 * すべて閉じる / 開く（まとまりとフォルダをまとめて開閉する。開いているまとまりが 1 つでもあれば「すべて閉じる」）））。
 * マージ・リベースの途中なら、コミットの欄の上に取りやめる・続けるの帯（OperationBanner）。下にコミットの欄と「ステージされている変更」「変更」。操作の実行中と失敗は action（親が持ち、表示を切り替えても残る）
 */
export function ChangesPane({
  status,
  git,
  groups,
  empty,
  action,
  selected,
  onSelect,
  rename,
}: {
  status: Extract<GitStatus, { repo: true }>;
  git: GitStatusController;
  groups: ChangeGroups;
  empty: boolean;
  action: ActionState<CommitBusy>;
  selected?: Selection;
  onSelect: (next: { path: string; staged: boolean }, newTab?: boolean) => void;
  rename: FileRename;
}) {
  // 変更の一覧を、フォルダの木で出すか（VS Code の「ツリーで表示 / 一覧で表示」）
  const [changesTree, setChangesTree] = useSetting(CHANGES_TREE);
  // 「ステージされている変更」「変更」の開閉（見出しの「すべて開く / すべて閉じる」でまとめて変えるため、ここで持つ）
  const commitActions = useCommitActions({ status, git, action });
  const moreMenu = useContextMenu({ align: "end" });
  const runGit = (gitAction: GitAction, paths: string[]) => void action.guard(() => git.act(gitAction, paths));
  const unstagedPaths = [...status.conflicts, ...status.unstaged].map((f) => f.path);
  const [folds, setFolds] = useState<{ staged: ChangeFold; unstaged: ChangeFold }>({ staged: OPEN_FOLD, unstaged: OPEN_FOLD });
  const showsStaged = groups.staged.length > 0;
  const anyOpen = (showsStaged && folds.staged.open) || folds.unstaged.open;
  // すべて閉じる: まとまりも、木の中のフォルダも閉じる。すべて開く: どちらも開く
  const closedFold = (files: ChangeGroups["staged"]): ChangeFold => ({ open: false, closed: new Set(folderPaths(buildTree({ files: files.map((f) => f.path), ignored: [] }))) });
  const toggleAll = () =>
    setFolds(anyOpen ? { staged: closedFold(groups.staged), unstaged: closedFold(groups.unstaged) } : { staged: OPEN_FOLD, unstaged: OPEN_FOLD });
  // 「ステージされている変更」「変更」に渡すもの
  const groupProps = {
    tree: changesTree,
    selected,
    onSelect,
    rename,
    onAction: runGit,
  };
  return (
    <>
      <header className="changes-head">
        <GitBranch size={14} aria-hidden />
        <span className="changes-branch" title="いまのブランチ">
          {status.branch ?? "（ブランチなし）"}
        </span>
        {status.ahead > 0 && (
          <span className="changes-sync" title={`リモートより ${status.ahead} 件進んでいます`}>
            <ArrowUp size={11} aria-hidden />
            {status.ahead}
          </span>
        )}
        {status.behind > 0 && (
          <span className="changes-sync" title={`リモートより ${status.behind} 件遅れています`}>
            <ArrowDown size={11} aria-hidden />
            {status.behind}
          </span>
        )}
        <span className="spacer" />
        <IconButton icon={Check} size={16} label="コミット" keys="⌘Enter" disabled={Boolean(commitActions.busy) || !commitActions.canCommit} onClick={() => void commitActions.commit()} />
        <RefreshButton size={16} label="変更を取り直す（リモートの情報も取ってくる）" busy={git.loading} onClick={() => void git.fetchRemote()} />
        <IconButton icon={changesTree ? List : ListTree} size={16} label={changesTree ? "一覧で表示" : "ツリーで表示"} onClick={() => setChangesTree(!changesTree)} />
        <IconButton
          icon={Ellipsis}
          size={16}
          className="changes-more"
          label="その他の操作"
          aria-haspopup="menu"
          aria-expanded={moreMenu.isOpen}
          onClick={(e) => moreMenu.toggle(e)}
        />
      </header>
      {moreMenu.menu && (
        <PopupMenu at={moreMenu.menu.at} label="ソース管理の操作" ignore=".changes-more" onClose={moreMenu.close}>
          <MenuItem disabled={Boolean(commitActions.busy) || status.behind === 0} title="リモートの変更を早送りで取り込みます" onSelect={() => void commitActions.pull()}>
            <ArrowDown size={14} aria-hidden /> プル
          </MenuItem>
          <MenuItem disabled={Boolean(commitActions.busy) || !commitActions.canPush || (status.ahead === 0 && !commitActions.publish)} onSelect={() => void commitActions.push()}>
            <ArrowUp size={14} aria-hidden /> プッシュ
          </MenuItem>
          <MenuItem title="リモートの情報を取ってきます（作業中のファイルは変えません）" onSelect={() => void git.fetchRemote()}>
            <RefreshCw size={14} aria-hidden /> フェッチ
          </MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem disabled={unstagedPaths.length === 0} onSelect={() => runGit("stage", unstagedPaths)}>
            <Plus size={14} aria-hidden /> すべての変更をステージ
          </MenuItem>
          <MenuItem disabled={status.staged.length === 0} onSelect={() => runGit("unstage", status.staged.map((f) => f.path))}>
            <Minus size={14} aria-hidden /> すべてのステージを取り消す
          </MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem disabled={empty} onSelect={toggleAll}>
            {anyOpen ? <ChevronsDownUp size={14} aria-hidden /> : <ChevronsUpDown size={14} aria-hidden />} {anyOpen ? "すべて閉じる" : "すべて開く"}
          </MenuItem>
        </PopupMenu>
      )}
      <ErrorText message={git.error ?? action.error} />
      <OperationBanner status={status} git={git} action={action} />
      <CommitBox status={status} actions={commitActions} />
      {empty ? (
        <p className="muted small changes-empty">変更はありません。</p>
      ) : (
        <>
          {showsStaged && (
            <ChangeGroup title="ステージされている変更" files={groups.staged} staged fold={folds.staged} onFoldChange={(staged) => setFolds((prev) => ({ ...prev, staged }))} {...groupProps} />
          )}
          <ChangeGroup title="変更" files={groups.unstaged} staged={false} fold={folds.unstaged} onFoldChange={(unstaged) => setFolds((prev) => ({ ...prev, unstaged }))} {...groupProps} />
        </>
      )}
    </>
  );
}
