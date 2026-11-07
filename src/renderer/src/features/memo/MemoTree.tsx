import type { CSSProperties, MouseEvent } from "react";
import { memoExtensionOf } from "@shared/memo/kinds";
import { cx } from "@/lib/cx";
import { Chevron } from "@/ui/Chevron";
import { Collapse } from "@/ui/Collapse";
import { InlineName } from "@/ui/InlineName";
import { FileIcon } from "@/features/editor/FileIcon";
import type { TreeNode } from "@/features/editor/treeModel";
import { isDraggingMemo, useMemoRowDrag } from "./memoDrag";
import { memoTitle } from "./memoPaths";

/** 一覧の行で名前を変えているメモ・フォルダ（initial: 書き直してもらうときの、前に書いた名前。round: 書き直すたびに増やして欄を作り直す） */
export interface MemoRenaming {
  path: string;
  initial?: string;
  round: number;
}

interface Props {
  nodes: TreeNode[];
  open: Set<string>;
  onToggle: (path: string) => void;
  /** 閉じたフォルダを開く（ドラッグを重ねて待ったとき） */
  onExpand: (path: string) => void;
  selected?: string;
  /** メモの行を押した（newTab = ⌘クリック。新しいタブで開く） */
  onSelect: (path: string, newTab: boolean) => void;
  /** 行の右クリック（行のメニュー） */
  onMenu: (e: MouseEvent, node: TreeNode) => void;
  /** メモ・フォルダを、フォルダ（"" は直下）へ落とした */
  onDropInto: (path: string, folder: string) => void;
  /** ドラッグを重ねている落とす先のフォルダ（"" は直下。null は重ねていない）。木の段をまたいで 1 つなので、一覧（MemoTab）が持つ */
  dropTarget: string | null;
  onDropTarget: (folder: string | null) => void;
  /** 名前を変えている行 */
  renaming: MemoRenaming | null;
  /** 行で名前を変え始める（ダブルクリック） */
  onStartRename: (node: TreeNode) => void;
  /** 書いた名前に変える（Enter・ピントを外す） */
  onRename: (node: TreeNode, name: string) => void;
  /** 名前を変えるのをやめた（Esc・名前を変えずに決めた） */
  onRenameEnd: () => void;
  depth?: number;
}

/**
 * メモのフォルダの木（エディタの木と同じ見た目。開いているフォルダの中だけ描き、開閉は高さをなめらかに変える `Collapse`）。行をドラッグしてフォルダへ落とすと動かす
 * （ファイルの行に落とすと、そのファイルのあるフォルダへ。閉じたフォルダに重ねて待つと開く）。右クリックで行のメニュー。
 * ダブルクリック（と右クリックの「名前を変更」・新しく作ったとき）で、行の名前の所がそのまま入力欄になる（メモは拡張子を除いた部分を書く）
 */
export function MemoTree(props: Props) {
  const { nodes, open, onToggle, onExpand, selected, onSelect, onMenu, onDropInto, dropTarget, onDropTarget, renaming, onStartRename, onRename, onRenameEnd, depth = 0 } = props;
  // 行のドラッグ（落とす先の印・閉じたフォルダに重ねて待つと開く。入力欄の上の「メモ」の木と共通）
  const { rowProps } = useMemoRowDrag({ isOpen: (path) => open.has(path), onExpand, onDropInto, onDropTarget });

  return (
    <ul className="file-tree" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => {
        const isOpen = node.dir && open.has(node.path);
        // 落とす先のフォルダは、行と中身をまとめて囲む（どのフォルダに入るかを、中のメモに重ねているときも分かるように）
        const isDropTarget = node.dir && dropTarget === node.path;
        const editing = renaming?.path === node.path;
        const style = { "--depth": depth } as CSSProperties;
        const head = (
          <>
            <span className="tree-chevron">{node.dir && <Chevron open={isOpen} />}</span>
            <FileIcon name={node.name} dir={node.dir} open={isOpen || isDropTarget} />
          </>
        );
        return (
          <li key={node.path} role="treeitem" aria-expanded={node.dir ? isOpen : undefined} aria-selected={selected === node.path} className={cx("tree-item", isDropTarget && "drop-target")}>
            {editing ? (
              // 名前の所を入力欄に（Enter・ピントを外すと決め、Esc でやめる。メモの拡張子は欄の右に添えて、書き換えさせない）
              <div className={cx("tree-row", "renaming", selected === node.path && "selected")} style={style}>
                {head}
                <InlineName
                  key={renaming.round}
                  initial={renaming.initial ?? (node.dir ? node.name : memoTitle(node.path))}
                  suffix={node.dir ? undefined : (memoExtensionOf(node.path) ?? undefined)}
                  maxLength={200}
                  className="memo-rename"
                  onSubmit={(name) => onRename(node, name)}
                  onCancel={onRenameEnd}
                />
              </div>
            ) : (
              <button
                className={cx("tree-row", selected === node.path && "selected", isDraggingMemo(node.path) && "dragging")}
                style={style}
                title={node.path}
                {...rowProps(node)}
                onClick={(e) => (node.dir ? onToggle(node.path) : onSelect(node.path, e.metaKey || e.ctrlKey))}
                onDoubleClick={() => onStartRename(node)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  onMenu(e, node);
                }}
              >
                {head}
                <span className="tree-name">{node.name}</span>
              </button>
            )}
            {/* 開閉で高さをなめらかに変える（サイドバーのまとまりと同じ動き。閉じきったら中身を外す） */}
            {node.dir && node.children.length > 0 && (
              <Collapse open={isOpen}>
                <MemoTree {...props} nodes={node.children} depth={depth + 1} />
              </Collapse>
            )}
          </li>
        );
      })}
    </ul>
  );
}
