import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { usePageFind } from "@/ui/usePageFind";
import { DiffView } from "./DiffView";
import { openEditorFind } from "./editorFind";
import { FileView } from "./FileView";
import { editedChange, selectedChange, type ChangeGroups, type Selection } from "./fileSelection";
import { registerFileTabSaver, selectionOf, setFileTabDirty, type FileTab } from "./fileTabs";
import type { GitStatusController } from "./useGitStatus";

/** ファイルのタブの中身が使うもの（EditorTab が、タブを並べるパネルの外から渡す） */
export interface FileTabsEnv {
  projectId: number;
  repoPath: string;
  git: GitStatusController;
  /** コミットしていない変更（差分のタブがどの差分を出すか） */
  groups: ChangeGroups;
  /** ファイルを開く（差分の「編集」。同じタブの中身を替える） */
  open: (next: Selection) => void;
}

export const FileTabsContext = createContext<FileTabsEnv | null>(null);

/**
 * ファイル・検索・変更のタブの右の、ファイルのタブの中身: エクスプローラー・検索の行から開いたファイルは中身（FileView。開いたらすぐ書け、変更は行の横の色の帯で見せる）、
 * 変更の一覧から開いたファイル・差分の「編集」から開いたファイルは差分を見ながら編集する中身（VS Code と同じ。changeSelection）、
 * 読むだけの差分にするもの（消したファイル・まだステージしていない変更もあるステージ済みの差分）は差分（DiffView）。
 * 差分がもうなければ（コミットした・元に戻した）、いまの中身を出す。⌘F は、開いているファイルの中を探す（編集の部品は Monaco の検索、差分・読むだけの表は右上の検索の欄。usePageFind）
 */
export function ProjectFileTab({ tab, panelKey }: { tab: FileTab; panelKey: string }) {
  const env = useContext(FileTabsContext);
  const ref = useRef<HTMLDivElement>(null);
  const find = usePageFind(ref, { native: openEditorFind, placeholder: "このファイルを検索", className: "page-find" });
  // 中身がなくなったら（タブを閉じた・別の画面へ移った）、書きかけも一緒になくなるので、保存していない印も外す
  useEffect(() => () => setFileTabDirty(panelKey, tab.key, false), [panelKey, tab.key]);
  // タブの × で「保存」を選んだときの保存のしかた（⌘S と同じ）
  const registerSave = useCallback((save: () => Promise<boolean>) => registerFileTabSaver(panelKey, tab.key, save), [panelKey, tab.key]);
  if (!env) return null;
  const { projectId, repoPath, git, groups } = env;
  const selected = selectionOf(tab);
  const change = selectedChange(selected, groups);
  const edited = editedChange(selected, groups);
  // ファイルの中身の表示・編集に渡すもの（保存していない変更は、タブごとに覚える）
  const fileViewProps = {
    projectId,
    repoPath,
    path: selected.path,
    gitStatus: git.status,
    version: git.version,
    onSaved: () => void git.refresh(),
    onDirtyChange: (dirty: boolean) => setFileTabDirty(panelKey, tab.key, dirty),
    registerSave,
    autoFocus: selected.focus,
  };
  return (
    <div ref={ref} className="changes-diff">
      {find}
      {selected.line !== undefined || selected.edit ? (
        <FileView key={`${selected.line ?? ""}:${selected.edit ? "edit" : ""}`} {...fileViewProps} line={selected.line} diffBase={edited} />
      ) : change ? (
        <DiffView
          projectId={projectId}
          file={change.file}
          staged={change.staged}
          version={git.version}
          onEdit={change.file.kind === "D" ? undefined : () => env.open({ path: change.file.path, staged: change.staged, edit: true, focus: true })}
        />
      ) : (
        <FileView key="file" {...fileViewProps} />
      )}
    </div>
  );
}
