import { useRef } from "react";
import type { GitFileChange } from "@shared/types";
import { usePageFind } from "@/ui/usePageFind";
import { DiffView } from "./DiffView";
import { openEditorFind } from "./editorFind";
import { FileView } from "./FileView";
import type { ChangesSelection, ChangesView } from "./useChangesSelection";
import type { GitStatusController } from "./useGitStatus";

/**
 * ファイルタブの右側: エクスプローラー・検索の行から開いたファイルは中身（FileView。開いたらすぐ書け、変更は行の横の色の帯で見せる）、
 * 変更の一覧から選んだファイル・差分の「編集」から開いたファイルは差分を見ながら編集する中身（VS Code と同じ。changeSelection）、
 * 読むだけの差分にするもの（消したファイル・まだステージしていない変更もあるステージ済みの差分）は差分（DiffView）、それ以外は案内。
 * ⌘F は、開いているファイルの中を探す（編集の部品は Monaco の検索、差分・読むだけの表は右上の検索の欄。usePageFind）
 */
export function ChangesDetail({
  view,
  projectId,
  repoPath,
  git,
  selection,
  change,
  edited,
  empty,
}: {
  view: ChangesView;
  projectId: number;
  repoPath: string;
  git: GitStatusController;
  selection: ChangesSelection;
  /** 選んだファイルの差分（selectedChange。なければ中身を出す） */
  change?: { file: GitFileChange; staged: boolean };
  /** 差分の「編集」から開いたファイルの差分（editedChange。編集しながら元の中身を左に並べる） */
  edited?: { file: GitFileChange; staged: boolean };
  /** コミットしていない変更がないか（「変更」の案内の文に使う） */
  empty: boolean;
}) {
  const { selected, setSelected } = selection;
  const ref = useRef<HTMLDivElement>(null);
  // ファイルを開いていない（案内だけの）ときは置かない（⌘F はボードの検索欄などへ）
  const find = usePageFind(ref, { native: openEditorFind, placeholder: "このファイルを検索", className: "page-find", enabled: Boolean(selected || change) });
  // ファイルの中身の表示・編集に渡すもの
  const fileViewProps = (path: string) => ({
    projectId,
    repoPath,
    path,
    gitStatus: git.status,
    version: git.version,
    onSaved: () => void git.refresh(),
    onDirtyChange: selection.setDirty,
  });
  return (
    <div ref={ref} className="changes-diff">
      {find}
      {selected && (selected.line !== undefined || selected.edit) ? (
        <FileView
          key={`${selected.path}:${selected.line ?? ""}:${selected.edit ? `edit:${selected.staged ?? ""}` : ""}`}
          {...fileViewProps(selected.path)}
          line={selected.line}
          diffBase={edited}
          autoFocus={selected.focus}
        />
      ) : change ? (
        <DiffView
          projectId={projectId}
          file={change.file}
          staged={change.staged}
          version={git.version}
          onEdit={change.file.kind === "D" ? undefined : () => void setSelected({ path: change.file.path, staged: change.staged, edit: true, focus: true })}
        />
      ) : selected && selected.staged === undefined ? (
        <FileView key={selected.path} {...fileViewProps(selected.path)} />
      ) : (
        <p className="muted small changes-hint">
          {view === "changes" && empty ? "コミットしていない変更はありません。" : "ファイルを選ぶと中身を表示します（変更の一覧から選ぶと差分）。"}
        </p>
      )}
    </div>
  );
}
