import { useEffect, useRef, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import { memoExtensionOf } from "@shared/memo/kinds";
import { cx } from "@/lib/cx";
import { Chevron } from "@/ui/Chevron";
import { Collapse } from "@/ui/Collapse";
import { InlineName } from "@/ui/InlineName";
import { FileIcon } from "@/features/editor/FileIcon";
import type { TreeNode } from "@/features/editor/treeModel";
import { memoTitle, parentOf } from "./memoPaths";

/** ドラッグで運ぶメモのパスの種類（ほかのドラッグと見分ける） */
export const MEMO_DRAG_TYPE = "application/x-kickoff-memo";

/** ドラッグで運んでいるメモか */
export const isMemoDrag = (e: DragEvent) => e.dataTransfer.types.includes(MEMO_DRAG_TYPE);

/** いま運んでいるメモ・フォルダのパス（dragover の間は運ぶ中身を読めないので、つかんだときに覚える） */
let draggingPath: string | null = null;

/**
 * 運んでいるものを folder（"" は直下）へ落とせるか。自分自身・自分の中のフォルダには入れられず、いまあるフォルダへ落としても何も変わらないので、
 * どちらも落とす先として示さない（ほかのウィンドウから運んできたなど、何を運んでいるか分からないときは落とせることにする）
 */
export function canDropInto(folder: string): boolean {
  if (draggingPath === null) return true;
  if (folder === draggingPath || folder.startsWith(`${draggingPath}/`)) return false;
  return parentOf(draggingPath) !== folder;
}

/** ドラッグを閉じたフォルダに重ねたまま、このくらい待つと開く（Finder と同じく、奥のフォルダへも落とせるように） */
const SPRING_OPEN_MS = 700;

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
  onSelect: (path: string) => void;
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
  const folderOfNode = (node: TreeNode) => (node.dir ? node.path : parentOf(node.path));
  // 閉じたフォルダにドラッグを重ねて待ったら開く
  const spring = useRef<{ path: string; timer: number } | null>(null);
  const stopSpring = () => {
    if (spring.current) window.clearTimeout(spring.current.timer);
    spring.current = null;
  };
  const startSpring = (node: TreeNode) => {
    if (!node.dir || open.has(node.path) || spring.current?.path === node.path) return;
    stopSpring();
    spring.current = { path: node.path, timer: window.setTimeout(() => onExpand(node.path), SPRING_OPEN_MS) };
  };
  useEffect(() => stopSpring, []);

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
                className={cx("tree-row", selected === node.path && "selected", draggingPath === node.path && "dragging")}
                style={style}
                title={node.path}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(MEMO_DRAG_TYPE, node.path);
                  e.dataTransfer.effectAllowed = "move";
                  draggingPath = node.path;
                }}
                onDragEnd={() => {
                  draggingPath = null;
                  onDropTarget(null);
                  stopSpring();
                }}
                onDragOver={(e) => {
                  if (!isMemoDrag(e)) return;
                  e.stopPropagation();
                  const folder = folderOfNode(node);
                  // 落とせない所（自分自身・自分の中・いまあるフォルダ）は、印を付けず、カーソルも「落とせない」にする
                  if (!canDropInto(folder)) {
                    e.dataTransfer.dropEffect = "none";
                    onDropTarget(null);
                    stopSpring();
                    return;
                  }
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  onDropTarget(folder);
                  startSpring(node);
                }}
                onDragLeave={(e) => {
                  // 行の中のアイコン・名前へ移っただけなら、重ねたまま（待つ時間をやり直さない）。落とす先の印は、次に重ねた所（行・一覧）が付け直す
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  stopSpring();
                }}
                onDrop={(e) => {
                  const path = e.dataTransfer.getData(MEMO_DRAG_TYPE);
                  draggingPath = null;
                  onDropTarget(null);
                  stopSpring();
                  if (!path) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onDropInto(path, folderOfNode(node));
                }}
                onClick={() => (node.dir ? onToggle(node.path) : onSelect(node.path))}
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
