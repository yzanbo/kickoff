import type { GitFileChange } from "../../../../core/types";
import { DiffView } from "./DiffView";
import { FileView } from "./FileView";
import type { ChangeKinds } from "./treeModel";
import type { ChangesSelection, ChangesView } from "./useChangesSelection";
import type { GitStatusController } from "./useGitStatus";

/**
 * エディタタブの右側: 検索の行や「編集」から開いたファイルは中身（FileView）、
 * 変更のあるファイルは差分（DiffView）、エクスプローラーから選んだ変更のないファイルは中身、それ以外は案内
 */
export function ChangesDetail({
  view,
  projectId,
  repoPath,
  git,
  selection,
  change,
  kinds,
  empty,
}: {
  view: ChangesView;
  projectId: number;
  repoPath: string;
  git: GitStatusController;
  selection: ChangesSelection;
  /** 選んだファイルの差分（selectedChange。なければ中身を出す） */
  change?: { file: GitFileChange; staged: boolean };
  kinds: ChangeKinds;
  /** コミットしていない変更がないか（「変更」の案内の文に使う） */
  empty: boolean;
}) {
  const { selected, setSelected } = selection;
  // ファイルの中身の表示・編集に渡すもの
  const fileViewProps = (path: string) => ({
    projectId,
    repoPath,
    path,
    version: git.version,
    onSaved: () => void git.refresh(),
    onDirtyChange: selection.setDirty,
  });
  return (
    <div className="changes-diff">
      {selected && (selected.line !== undefined || selected.edit) ? (
        <FileView
          key={`${selected.path}:${selected.line ?? ""}:${selected.edit ? "edit" : ""}`}
          {...fileViewProps(selected.path)}
          line={selected.line}
          changed={kinds.files.has(selected.path)}
          initialEditing={selected.edit}
        />
      ) : change ? (
        <DiffView
          projectId={projectId}
          file={change.file}
          staged={change.staged}
          version={git.version}
          onEdit={change.file.kind === "D" ? undefined : () => void setSelected({ path: change.file.path, edit: true })}
        />
      ) : selected && selected.staged === undefined ? (
        <FileView key={selected.path} {...fileViewProps(selected.path)} />
      ) : (
        <p className="muted small changes-hint">
          {view === "changes" && empty ? "コミットしていない変更はありません。" : "ファイルを選ぶと、変更があれば差分、なければ中身を表示します。"}
        </p>
      )}
    </div>
  );
}
