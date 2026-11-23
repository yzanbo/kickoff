import type { DragEvent, MouseEvent, ReactNode } from "react";
import { Chevron } from "@/foundation/ui/kit/Chevron";
import { FileIcon } from "@/foundation/ui/code/FileIcon";
import type { TreeNode as RowNode } from "@/foundation/ui/kit/list/tree";
import { TreeView, type TreeRenaming, type TreeRowAttrs } from "@/foundation/ui/kit/list/TreeView";
import { newEntryNameError, type TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { useTree } from "@/foundation/ui/kit/list/useTree";
import type { ChangeMarks } from "./filesGit";
import type { FileCreate, FileRename } from "./useFileOps";

/** 選んだいくつかの行の 1 つ（右クリックのメニューに渡す。staged は変更の一覧のどちらのまとまりか。ファイルタブでは持たない） */
export interface PickedEntry {
  path: string;
  dir: boolean;
  staged?: boolean;
}

/** クリック・Space の修飾キー */
type Modifiers = Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey">;

/** ⌘ / Shift ＋クリックの複数選択（持ち主が useMultiSelect で持つ。ファイルタブの木・変更の一覧） */
export interface TreeMulti {
  /** 何か選んでいるか（選んでいる間は、ふだんの選んでいる行 = 開いているファイルの色を出さない） */
  any: boolean;
  has: (path: string) => boolean;
  /** 行のクリック・Space。⌘ / Shift なら選んで true（ふだんの動きをしない）、修飾キーがなければ選んだものを外して false */
  click: (e: Modifiers, path: string) => boolean;
  /** 右クリックした行が選んだ 2 つ以上の 1 つなら、選んでいるものすべて。ほかの行なら選んだものを外して null */
  manyFor: (path: string) => PickedEntry[] | null;
}

interface Props {
  nodes: TreeNode[];
  /** 開いているフォルダ */
  open: ReadonlySet<string>;
  onToggle: (path: string) => void;
  selected?: string;
  /** ファイルを押した（newTab = ⌘クリック・Ctrl クリック。新しいタブに開く。複数選択（multi）があれば ⌘ は選ぶのに使う） */
  onSelect: (path: string, newTab?: boolean) => void;
  /** ⌘ / Shift ＋クリックの複数選択（ファイルタブの木・変更の一覧。なければ ⌘クリックは新しいタブ） */
  multi?: TreeMulti;
  /** 変更の記号（ファイルとフォルダ。VS Code と同じく、変更のあるものだけ色を変える） */
  marks: ChangeMarks;
  /** 行の右に出す操作（ステージ・元に戻すなど。マウスを乗せたときに出す） */
  actions?: (node: TreeNode) => ReactNode;
  /** 名前の変更（行にピントがあるときの Enter・右クリック。canRename が false の行は変えない） */
  rename?: FileRename;
  canRename?: (node: TreeNode) => boolean;
  /** 新しいファイル・フォルダの名前の欄（その中のいちばん上に出す。ファイルタブだけ） */
  create?: FileCreate;
  /** ファイルの行をドラッグできるようにする（右のファイルのタブの欄へ落として開く・分ける。ファイルタブだけ） */
  fileDrag?: (path: string) => { draggable: true; onDragStart: (e: DragEvent<HTMLElement>) => void; onDragEnd: () => void };
  /** 開いたフォルダの行を、中身を流している間だけ上に貼り付ける（ファイルタブの木。VS Code の Sticky Scroll） */
  sticky?: boolean;
  /** 木の名前（読み上げ） */
  label?: string;
}

/** 同じフォルダに同じ名前があるか（名前の欄で書くたびに確かめる） */
export const siblingNameError = (siblings: readonly { name: string; path: string }[], self: string) => (name: string) =>
  /[/\\]/.test(name) ? "「/」は名前に使えません" : siblings.some((n) => n.path !== self && n.name === name) ? `「${name}」はもうあります` : null;

/** 新しいファイル・フォルダの名前の欄の行のキー（パスと重ならない） */
const CREATE_KEY = "\0create";

/** 木の 1 行（file が null なら新しい名前の欄。無視しているフォルダは children を持たない = 開かない） */
interface FileRow extends RowNode<string> {
  file: TreeNode | null;
  children?: FileRow[];
}

/** 描く木と、パスから同じ段の並びを引く表（名前の確かめに使う） */
function fileRows(nodes: TreeNode[], creating: FileCreate["creating"] | undefined) {
  const siblings = new Map<string, TreeNode[]>();
  const walk = (level: TreeNode[], parent: string): FileRow[] => {
    siblings.set(parent, level);
    const rows = level.map((node): FileRow => ({ key: node.path, file: node, children: node.dir && !node.ignored ? walk(node.children, node.path) : undefined }));
    return creating?.parent === parent ? [{ key: CREATE_KEY, file: null }, ...rows] : rows;
  };
  const roots = walk(nodes, "");
  const childrenOf = (parent: string) => siblings.get(parent) ?? [];
  const levelOf = (path: string) => childrenOf(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  return { roots, childrenOf, levelOf, nodeOf: (path: string) => levelOf(path).find((n) => n.path === path) };
}

/**
 * エクスプローラーのフォルダの木（土台の TreeView の上。開いているフォルダの中だけ描く）。
 * 押す・Space で開く / 開閉、Enter で名前の変更（Finder・ノートの木と同じ）、↑↓←→ で行を移る・開閉する
 */
export function FileTree({ nodes, open, onToggle, selected, onSelect, multi, marks, actions, rename, canRename, create, fileDrag, sticky, label = "ファイル" }: Props) {
  const creating = create?.creating ?? null;
  const { roots, childrenOf, levelOf, nodeOf } = fileRows(nodes, creating);
  const markOf = (node: TreeNode) => (node.dir ? marks.folders : marks.files).get(node.path);
  const renamable = (node: TreeNode) => Boolean(rename) && (canRename?.(node) ?? true);
  const activate = (path: string, e: Modifiers) => {
    const node = nodeOf(path);
    if (!node || multi?.click(e, path)) return;
    if (node.dir) {
      // 無視しているフォルダは中を開かない（node_modules などを全部たどらないように）
      if (!node.ignored) onToggle(path);
    } else onSelect(path, !multi && (e.metaKey || e.ctrlKey));
  };
  const tree = useTree<string, FileRow>({
    roots,
    open: { isOpen: (path) => open.has(path), set: (path, next) => open.has(path) !== next && onToggle(path) },
    selection: { has: (path) => (multi?.any ? multi.has(path) : selected === path) },
    onActivate: activate,
    onRename: (path) => {
      const node = nodeOf(path);
      if (node && rename && renamable(node)) rename.start(path);
      else activate(path, { metaKey: false, ctrlKey: false, shiftKey: false });
    },
    label,
  });
  const renamingNode = rename?.renaming ? nodeOf(rename.renaming) : undefined;
  const renaming: TreeRenaming<string> | null = creating
    ? {
        key: CREATE_KEY,
        initial: "",
        placeholder: creating.dir ? "フォルダー名" : "ファイル名",
        validate: (name) => newEntryNameError(childrenOf(creating.parent), name),
        submit: (name) => create?.submit(name),
        cancel: () => create?.cancel(),
      }
    : rename && renamingNode
      ? {
          key: renamingNode.path,
          initial: renamingNode.name,
          validate: siblingNameError(levelOf(renamingNode.path), renamingNode.path),
          submit: (name) => rename.submit(renamingNode.path, name),
          cancel: rename.cancel,
        }
      : null;
  const rowProps = (row: { node: FileRow }): TreeRowAttrs => {
    const node = row.node.file;
    if (!node) return {};
    const mark = markOf(node);
    return {
      className: node.ignored ? "ignored" : undefined,
      "data-kind": mark?.kind,
      title: mark ? `${node.path}（${mark.label}）` : node.path,
      ...(!node.dir && fileDrag ? fileDrag(node.path) : {}),
      onContextMenu:
        rename && renamable(node)
          ? (e) => {
              e.preventDefault();
              rename.openMenu(e, node.path, node, multi?.manyFor(node.path) ?? null);
            }
          : undefined,
    };
  };
  return (
    <TreeView<string, FileRow>
      tree={tree}
      sticky={sticky}
      renaming={renaming}
      rowProps={rowProps}
      renderRow={(row, { nameField }) => {
        const node = row.node.file;
        if (!node) {
          return (
            <>
              <span className="tree-chevron" />
              <FileIcon name="" dir={creating?.dir ?? false} open={false} />
              {nameField}
            </>
          );
        }
        const mark = markOf(node);
        return (
          <>
            <span className="tree-chevron">{row.hasChildren && <Chevron open={row.open} />}</span>
            <FileIcon name={node.name} dir={node.dir} open={row.open} />
            {nameField ?? <span className="tree-name">{node.name}</span>}
            {/* ファイルは記号、フォルダは点（中に変更がある） */}
            {!nameField && mark && <span className="tree-kind">{node.dir ? "•" : mark.kind}</span>}
          </>
        );
      }}
      trailing={
        actions &&
        ((row) =>
          row.node.file && (
            // 行の右の操作（押しても行を開かない・行の右クリックにしない）
            <span className="row-actions" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
              {actions(row.node.file)}
            </span>
          ))
      }
    />
  );
}
