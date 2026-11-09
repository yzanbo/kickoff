import { ArrowDown, ArrowUp, ChevronsDownUp, ChevronsUpDown, GitBranch, List, ListTree } from "lucide-react";
import { useState } from "react";
import type { GitStatus } from "@shared/types";
import type { ActionState } from "@/hooks/useAction";
import { useSetting } from "@/hooks/useSetting";
import { CHANGES_TREE } from "@/lib/storageKeys";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { ChangeGroup, OPEN_FOLD, type ChangeFold, type GitAction } from "./ChangeGroup";
import { CommitBox, type CommitBusy } from "./CommitBox";
import { OperationBanner } from "./OperationBanner";
import { buildTree, folderPaths } from "./treeModel";
import type { ChangeGroups, Selection } from "./useChangesSelection";
import type { FileRename } from "./useFileActions";
import type { GitStatusController } from "./useGitStatus";

/**
 * ファイルタブの左の「変更」（ソース管理）: 見出しにブランチと進み・遅れ、一覧 / ツリーの切り替え、取り直し、すべて開く / すべて閉じる
 * （まとまりとフォルダをまとめて開閉する。開いているまとまりが 1 つでもあれば「すべて閉じる」）。
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
  onSelect: (next: { path: string; staged: boolean }) => void;
  rename: FileRename;
}) {
  // 変更の一覧を、フォルダの木で出すか（VS Code の「ツリーで表示 / 一覧で表示」）
  const [changesTree, setChangesTree] = useSetting(CHANGES_TREE);
  // 「ステージされている変更」「変更」の開閉（見出しの「すべて開く / すべて閉じる」でまとめて変えるため、ここで持つ）
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
    onAction: (gitAction: GitAction, paths: string[]) => void action.guard(() => git.act(gitAction, paths)),
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
        <IconButton icon={changesTree ? List : ListTree} label={changesTree ? "一覧で表示" : "ツリーで表示"} onClick={() => setChangesTree(!changesTree)} />
        <RefreshButton label="変更を取り直す（リモートの情報も取ってくる）" busy={git.loading} onClick={() => void git.fetchRemote()} />
        <IconButton icon={anyOpen ? ChevronsDownUp : ChevronsUpDown} label={anyOpen ? "すべて閉じる" : "すべて開く"} disabled={empty} onClick={toggleAll} />
      </header>
      <ErrorText message={git.error ?? action.error} />
      <OperationBanner status={status} git={git} action={action} />
      <CommitBox status={status} git={git} action={action} />
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
