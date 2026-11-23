import type { ReactNode } from "react";
import type { GitFileChange } from "@shared/git/types";
import { GIT_CHANGE_LABELS } from "@shared/git/labels";
import { cx } from "@/foundation/ui/lib/cx";
import { baseName } from "@/foundation/ui/lib/format";
import { isRenameKey } from "@/foundation/ui/lib/keys";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { PathParts } from "@/foundation/ui/kit/PathParts";
import { FileIcon } from "@/foundation/ui/code/FileIcon";
import { buildTree, folderPaths, type TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { FileTree, siblingNameError, type FileRename, type TreeMulti } from "@/features/files/ui";
import { kindMaps } from "./changeMarks";

/** 閉じたフォルダの組で、path を開け閉めした新しい組 */
export function toggleFolder(closed: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(closed);
  if (!next.delete(path)) next.add(path);
  return next;
}

/**
 * 変わったファイルの一覧（変更の一覧のまとまり・コミットの詳細）。tree ならフォルダの木（FileTree）、でなければパスの平らな一覧。
 * actions は行の右の操作（木ではフォルダの行にも）、rename があれば Enter・右クリックで名前を変える（消したファイルは変えない）
 */
export function ChangedFiles({
  files,
  tree,
  selected,
  onSelect,
  multi,
  actions,
  rename,
  closed,
  onToggleFolder,
}: {
  files: readonly GitFileChange[];
  tree: boolean;
  /** 選んでいるファイルのパス */
  selected: string | undefined;
  onSelect: (path: string, newTab?: boolean) => void;
  /** ⌘ / Shift ＋クリックの複数選択 */
  multi?: TreeMulti;
  actions?: (node: Pick<TreeNode, "path" | "name" | "dir">) => ReactNode;
  rename?: FileRename;
  /** 木で閉じたフォルダ（初めは全部開いておく） */
  closed: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
}) {
  const nodes = tree ? buildTree({ files: files.map((f) => f.path), ignored: [] }) : [];
  const marks = kindMaps(files);
  if (tree) {
    return (
      <FileTree
        nodes={nodes}
        open={new Set(folderPaths(nodes).filter((p) => !closed.has(p)))}
        onToggle={onToggleFolder}
        selected={selected}
        onSelect={onSelect}
        multi={multi}
        marks={marks}
        actions={actions}
        rename={rename}
        // 変更の一覧ではファイルだけ（フォルダには変更のないファイルも入っているので）。消したファイルは変えられない
        canRename={rename && ((node) => !node.dir && marks.files.get(node.path)?.kind !== "D")}
      />
    );
  }
  return (
    <ul className="change-files">
      {files.map((file) => {
        const name = baseName(file.path);
        const isSelected = multi?.any ? multi.has(file.path) : selected === file.path;
        const renamable = rename && file.kind !== "D";
        if (rename?.renaming === file.path) {
          // 名前を変えている行（同じ名前のほかのファイルの確かめは、変更の一覧にないものもあるのでコアに任せる）
          return (
            <li key={file.path} className="change-item">
              <div className="list-item change-file renaming">
                <FileIcon name={name} />
                <InlineName className="tree-rename" maxLength={255} initial={name} validate={siblingNameError([], file.path)} onSubmit={(next) => rename.submit(file.path, next)} onCancel={rename.cancel} />
              </div>
            </li>
          );
        }
        return (
          <li key={file.path} className={actions ? "change-item" : undefined}>
            <button
              className={cx("list-item change-file", isSelected && "selected")}
              aria-current={isSelected || undefined}
              title={`${file.path}（${GIT_CHANGE_LABELS[file.kind]}）`}
              onClick={(e) => {
                if (!multi?.click(e, file.path)) onSelect(file.path);
              }}
              // 行にピントがあるときの Enter で名前を変える（ファイルタブの木と同じ）
              onKeyDown={(e) => {
                if (!renamable || !isRenameKey(e)) return;
                e.preventDefault();
                rename.start(file.path);
              }}
              onContextMenu={(e) => {
                if (!rename) return;
                // 消したファイルは名前を変えられないので、選んだいくつかの 1 つのときだけメニューを出す
                const many = multi?.manyFor(file.path) ?? null;
                if (!many && !renamable) return;
                e.preventDefault();
                rename.openMenu(e, file.path, {}, many);
              }}
            >
              <FileIcon name={name} />
              <PathParts path={file.path} nameClass={cx("change-name", file.kind === "D" && "deleted")} dirClass="change-dir" />
              <span className="change-kind" data-kind={file.kind} aria-label={GIT_CHANGE_LABELS[file.kind]}>
                {file.kind}
              </span>
            </button>
            {actions && <span className="row-actions">{actions({ path: file.path, name, dir: false })}</span>}
          </li>
        );
      })}
    </ul>
  );
}
