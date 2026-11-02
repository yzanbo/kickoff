import { ArrowDown, ArrowUp, GitBranch, List, ListTree } from "lucide-react";
import type { GitStatus } from "../../../../core/types";
import type { useActionError } from "../../hooks/useActionError";
import { useStoredFlag } from "../../hooks/useStoredState";
import { CHANGES_TREE_KEY } from "../../storageKeys";
import { ErrorText } from "../ErrorText";
import { IconButton, RefreshButton } from "../IconButton";
import { ChangeGroup, type GitAction } from "./ChangeGroup";
import { CommitBox } from "./CommitBox";
import type { ChangeGroups, Selection } from "./useChangesSelection";
import type { GitStatusController } from "./useGitStatus";

/**
 * エディタタブの左の「変更」（ソース管理）: 見出しにブランチと進み・遅れ、一覧 / ツリーの切り替え、取り直し。
 * 下にコミットの欄と「ステージされている変更」「変更」。操作の失敗は actionError（親が持ち、表示を切り替えても残る）に出す
 */
export function ChangesPane({
  status,
  git,
  groups,
  empty,
  actionError,
  selected,
  onSelect,
}: {
  status: Extract<GitStatus, { repo: true }>;
  git: GitStatusController;
  groups: ChangeGroups;
  empty: boolean;
  actionError: ReturnType<typeof useActionError>;
  selected?: Selection;
  onSelect: (next: Selection) => void;
}) {
  // 変更の一覧を、フォルダの木で出すか（VS Code の「ツリーで表示 / 一覧で表示」）
  const [changesTree, setChangesTree] = useStoredFlag(CHANGES_TREE_KEY, true);
  // 「ステージされている変更」「変更」に渡すもの
  const groupProps = {
    tree: changesTree,
    selected,
    onSelect,
    onAction: (action: GitAction, paths: string[]) => void actionError.guard(() => git.act(action, paths)),
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
      </header>
      <ErrorText message={git.error ?? actionError.error} />
      <CommitBox status={status} git={git} guard={actionError.guard} />
      {empty ? (
        <p className="muted small changes-empty">変更はありません。</p>
      ) : (
        <>
          {groups.staged.length > 0 && <ChangeGroup title="ステージされている変更" files={groups.staged} staged {...groupProps} />}
          <ChangeGroup title="変更" files={groups.unstaged} staged={false} {...groupProps} />
        </>
      )}
    </>
  );
}
