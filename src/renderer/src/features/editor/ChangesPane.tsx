import { ArrowDown, ArrowUp, GitBranch, List, ListTree } from "lucide-react";
import type { GitStatus } from "@shared/types";
import type { ActionState } from "@/hooks/useAction";
import { useSetting } from "@/hooks/useSetting";
import { CHANGES_TREE } from "@/lib/storageKeys";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { ChangeGroup, type GitAction } from "./ChangeGroup";
import { CommitBox, type CommitBusy } from "./CommitBox";
import type { ChangeGroups, Selection } from "./useChangesSelection";
import type { FileRename } from "./useFileActions";
import type { GitStatusController } from "./useGitStatus";

/**
 * ファイルタブの左の「変更」（ソース管理）: 見出しにブランチと進み・遅れ、一覧 / ツリーの切り替え、取り直し。
 * 下にコミットの欄と「ステージされている変更」「変更」。操作の実行中と失敗は action（親が持ち、表示を切り替えても残る）
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
      </header>
      <ErrorText message={git.error ?? action.error} />
      <CommitBox status={status} git={git} action={action} />
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
