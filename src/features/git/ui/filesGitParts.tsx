// files の口 filesGit の Git の部品（filesGit.ts が遅れて読む）: 変更の一覧と、読むだけの差分のタブ
import type { ActionState } from "@/foundation/ui/hooks/useAction";
import type { FilesChangesPaneProps, FilesDiffTabProps } from "@/features/files/ui";
import { ChangesPane } from "./ChangesPane";
import { changeSelection, groupsOf } from "./changes/changeGroups";
import { DiffView } from "./DiffView";
import { fileOf, gitOf } from "./filesGit";
import type { CommitBusy } from "./useCommitActions";

/** EditorTab の「変更」: Git の状態から変更の一覧を描く（選んだら差分を見ながら編集にするかを決めて渡す） */
export function FilesChangesPane({ status, action, selected, onSelect, rename, onHideList }: FilesChangesPaneProps) {
  const git = gitOf(status);
  const current = git.status;
  if (!current?.repo) return null;
  const groups = groupsOf(current);
  return (
    <ChangesPane
      status={current}
      git={git}
      groups={groups}
      empty={groups.staged.length === 0 && groups.unstaged.length === 0}
      action={action as ActionState<CommitBusy>}
      selected={selected}
      onSelect={(next, newTab) => onSelect(changeSelection(next, groups), newTab)}
      rename={rename}
      onHideList={onHideList}
    />
  );
}

export function FilesDiffTab({ projectId, change, version, onEdit }: FilesDiffTabProps) {
  return <DiffView projectId={projectId} file={fileOf(change)} staged={change.staged} version={version} onEdit={onEdit} />;
}
