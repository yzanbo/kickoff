import { ChevronsDownUp } from "lucide-react";
import { ErrorText } from "../ErrorText";
import { IconButton, RefreshButton } from "../IconButton";
import { FileTree } from "./FileTree";
import type { ChangeKinds } from "./treeModel";
import type { GitStatusController } from "./useGitStatus";
import type { useProjectFiles } from "./useProjectFiles";

/**
 * エディタタブの左の「すべてのファイル」（エクスプローラー）: 見出しにフォルダ名・取り直し・フォルダをすべて閉じる、
 * 下にフォルダの木（変更のあるファイルとフォルダだけ色を変える）。フォルダの開閉は親が持つ（表示を切り替えても残る）
 */
export function FilesPane({
  rootName,
  git,
  files,
  kinds,
  folders,
  selected,
  onSelect,
}: {
  rootName: string;
  git: GitStatusController;
  files: ReturnType<typeof useProjectFiles>;
  kinds: ChangeKinds;
  folders: { open: Set<string>; toggle: (path: string) => void; closeAll: () => void };
  /** 選んでいるファイルのパス */
  selected?: string;
  onSelect: (path: string) => void;
}) {
  return (
    <>
      <header className="changes-head">
        <span className="changes-branch" title={rootName}>
          {rootName}
        </span>
        <span className="spacer" />
        <RefreshButton label="ファイルの一覧を取り直す" busy={git.loading} onClick={() => void git.refresh()} />
        <IconButton icon={ChevronsDownUp} label="フォルダをすべて閉じる" disabled={folders.open.size === 0} onClick={folders.closeAll} />
      </header>
      <ErrorText message={files.error} />
      {files.tree ? (
        <FileTree nodes={files.tree} open={folders.open} onToggle={folders.toggle} selected={selected} onSelect={onSelect} kinds={kinds} />
      ) : (
        !files.error && <p className="muted small changes-empty">読み込み中…</p>
      )}
      {files.truncated && <p className="muted small changes-empty">ファイルが多いため、途中までを表示しています。</p>}
    </>
  );
}
