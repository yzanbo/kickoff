import { ChevronsDownUp, ChevronsUpDown, FilePlus, FolderPlus } from "lucide-react";
import { useMemo, type ComponentProps } from "react";
import { isCancelKey } from "@/lib/keys";
import { useMultiSelect } from "@/hooks/useMultiSelect";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { FileTree, type TreeMulti } from "./FileTree";
import { folderPaths, parentPath, treePaths, visibleTreePaths, type ChangeKinds } from "./treeModel";
import type { FileCreate, FileRename } from "./useFileActions";
import type { GitStatusController } from "./useGitStatus";
import type { useProjectFiles } from "./useProjectFiles";

/**
 * ファイルタブの左の「すべてのファイル」（エクスプローラー）: 見出しにフォルダ名と、VS Code と同じ並びで新しいファイル・新しいフォルダー・取り直し・すべて開く / すべて閉じる
 * （新しいファイル・フォルダーは、開いているファイルの入ったフォルダーに作る。開いていなければいちばん外側。開いているフォルダが 1 つでもあれば「すべて閉じる」）、
 * 下にフォルダの木（変更のあるファイルとフォルダだけ色を変える）。フォルダの開閉は親が持つ（表示を切り替えても残る）。
 * 木の下の空いている所の右クリックでも、新しいファイル・フォルダー（いちばん外側に作る）などのメニューを出す（行の右クリックは行のメニュー）。
 * 行は ⌘ / Ctrl ＋クリックで 1 つずつ、Shift ＋クリックで見えている並びの範囲を選べる（利用者の依頼。useMultiSelect。まだ何も選んでいなければ開いているファイルも入れる）。
 * 選んだ行の 1 つを右クリックすると、選んでいるものすべてのメニュー。ふつうのクリック・空いている所を押す・Esc で外す
 */
export function FilesPane({
  rootName,
  git,
  files,
  kinds,
  folders,
  selected,
  onSelect,
  rename,
  create,
  fileDrag,
}: {
  rootName: string;
  git: GitStatusController;
  files: ReturnType<typeof useProjectFiles>;
  kinds: ChangeKinds;
  folders: { open: Set<string>; toggle: (path: string) => void; openAll: () => void; closeAll: () => void };
  /** 選んでいるファイルのパス */
  selected?: string;
  onSelect: (path: string, newTab?: boolean) => void;
  /** ファイル・フォルダの名前の変更（行にピントがあるときの Enter・右クリック） */
  rename: FileRename;
  /** 新しいファイル・フォルダの名前の欄 */
  create: FileCreate;
  /** ファイルの行のドラッグ（右のファイルのタブの欄へ落として開く・分ける） */
  fileDrag?: ComponentProps<typeof FileTree>["fileDrag"];
}) {
  // 見出しのボタンで作る場所（開いているファイルの入ったフォルダー。VS Code は選んでいる行のフォルダーに作る）
  const createIn = selected ? parentPath(selected) : "";
  const anyOpen = folders.open.size > 0;
  // ⌘ / Shift ＋クリックで選んだいくつかの行（範囲は、いま見えている行の上からの並び）
  const tree = files.tree;
  const allPaths = useMemo(() => treePaths(tree ?? []), [tree]);
  const dirs = useMemo(() => new Set(folderPaths(tree ?? [])), [tree]);
  const picks = useMultiSelect(allPaths, () => visibleTreePaths(tree ?? [], folders.open));
  const multi: TreeMulti = {
    any: picks.selected.length > 0,
    has: picks.has,
    click: (e, path) => picks.click(e, path, selected ?? null),
    manyFor: (path) => {
      if (picks.has(path) && picks.selected.length > 1) return picks.selected.map((p) => ({ path: p, dir: dirs.has(p) }));
      picks.clear();
      return null;
    },
  };
  return (
    <>
      <header className="changes-head">
        <span className="changes-branch" title={rootName}>
          {rootName}
        </span>
        <span className="spacer" />
        <IconButton icon={FilePlus} label="新しいファイル…" disabled={!files.tree} onClick={() => create.start(createIn, false)} />
        <IconButton icon={FolderPlus} label="新しいフォルダー…" disabled={!files.tree} onClick={() => create.start(createIn, true)} />
        <RefreshButton label="ファイルの一覧を取り直す" busy={git.loading} onClick={() => void git.refresh()} />
        <IconButton
          icon={anyOpen ? ChevronsDownUp : ChevronsUpDown}
          label={anyOpen ? "フォルダをすべて閉じる" : "フォルダをすべて開く"}
          disabled={!files.tree?.some((n) => n.dir && !n.ignored)}
          onClick={anyOpen ? folders.closeAll : folders.openAll}
        />
      </header>
      <div
        className="files-pane"
        onContextMenu={(e) => {
          // 行・名前の欄の右クリックは、それぞれに任せる
          if (e.target instanceof Element && e.target.closest(".tree-row")) return;
          e.preventDefault();
          picks.clear();
          rename.openMenu(e, null);
        }}
        // 行の外（木の下の空いている所など）を押したら、選んだものを外す
        onClick={(e) => {
          if (!(e.target instanceof Element && e.target.closest(".tree-row, button, input"))) picks.clear();
        }}
        // Esc で、選んだものを外す
        onKeyDown={(e) => {
          if (!isCancelKey(e) || picks.selected.length === 0) return;
          e.preventDefault();
          picks.clear();
        }}
      >
        <ErrorText message={files.error} />
        {files.tree ? (
          <FileTree nodes={files.tree} open={folders.open} onToggle={folders.toggle} selected={selected} onSelect={onSelect} multi={multi} kinds={kinds} rename={rename} create={create} fileDrag={fileDrag} />
        ) : (
          !files.error && <p className="muted small changes-empty">読み込み中…</p>
        )}
        {files.truncated && <p className="muted small changes-empty">ファイルが多いため、途中までを表示しています。</p>}
      </div>
    </>
  );
}
