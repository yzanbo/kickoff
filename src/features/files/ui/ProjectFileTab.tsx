import { createContext, useContext, useRef } from "react";
import { usePageFind } from "@/foundation/ui/kit/usePageFind";
import { openEditorFind } from "@/foundation/ui/code/editorFind";
import { FileView } from "./FileView";
import { fileTabPlace, selectionOf, type FileTab } from "./fileTabs";
import { filesGitImpl, type FilesGitStatus } from "./filesGit";
import type { Selection } from "./tabSelection";

/** ファイルのタブの中身が使うもの（EditorTab が、タブを並べるパネルの外から渡す） */
export interface FileTabsEnv {
  projectId: number;
  repoPath: string;
  /** Git の状態（差分のタブがどの差分を出すか・帯・保存したあとの取り直し） */
  git: FilesGitStatus;
  /** ファイルを開く（差分の「編集」。同じタブの中身を替える） */
  open: (next: Selection) => void;
}

export const FileTabsContext = createContext<FileTabsEnv | null>(null);

/**
 * ファイル・検索・変更のタブの右の、ファイルのタブの中身: エクスプローラー・検索の行から開いたファイルは中身（FileView。開いたらすぐ書け、変更は行の横の色の帯で見せる）、
 * 変更の一覧から開いたファイル・差分の「編集」から開いたファイルは差分を見ながら編集する中身（VS Code と同じ。changeSelection）、
 * 読むだけの差分にするもの（消したファイル・まだステージしていない変更もあるステージ済みの差分）は差分（Git の口の DiffTab）。
 * 差分がもうなければ（コミットした・元に戻した）、いまの中身を出す。⌘F は、開いているファイルの中を探す（編集の部品は Monaco の検索、差分・読むだけの表は右上の検索の欄。usePageFind）
 */
export function ProjectFileTab({ tab, panelKey }: { tab: FileTab; panelKey: string }) {
  const env = useContext(FileTabsContext);
  const ref = useRef<HTMLDivElement>(null);
  const find = usePageFind(ref, { native: openEditorFind, placeholder: "このファイルを検索", className: "page-find" });
  if (!env) return null;
  const { projectId, repoPath, git } = env;
  const { DiffTab, tabChange } = filesGitImpl();
  const selected = selectionOf(tab);
  const shown = tabChange(git, selected);
  const change = shown?.kind === "diff" ? shown.change : undefined;
  const edited = shown?.kind === "edit" ? shown.change : undefined;
  // ファイルの中身の表示・編集に渡すもの（保存していない変更は、未保存の登録簿にタブの置き場所で出す。タブの「●」・× の確かめが引く）
  const fileViewProps = {
    projectId,
    repoPath,
    path: selected.path,
    git,
    onSaved: () => void git.refresh(),
    tab: fileTabPlace(panelKey, tab.key),
    autoFocus: selected.focus,
  };
  return (
    <div ref={ref} className="changes-diff">
      {find}
      {selected.line !== undefined || selected.edit ? (
        <FileView key={`${selected.line ?? ""}:${selected.edit ? "edit" : ""}`} {...fileViewProps} line={selected.line} diffBase={edited} />
      ) : change ? (
        <DiffTab
          projectId={projectId}
          change={change}
          version={git.version}
          onEdit={change.deleted ? undefined : () => env.open({ path: change.path, staged: change.staged, edit: true, focus: true })}
        />
      ) : (
        <FileView key="file" {...fileViewProps} />
      )}
    </div>
  );
}
