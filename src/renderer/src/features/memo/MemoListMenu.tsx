import type { Placement } from "@/lib/floating";
import type { TreeNode } from "@/features/editor/treeModel";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";

/** 一覧の右クリックで指したもの（node: 右クリックした行。null = 空いている所。many: 選んだいくつかの行の 1 つを右クリックしたときの、選んでいるものすべて） */
export interface MemoMenuTarget {
  node: TreeNode | null;
  many: readonly { path: string; dir: boolean }[] | null;
}

interface Props {
  at: Placement;
  target: MemoMenuTarget;
  /** メモのフォルダ（パスをコピーの頭） */
  dir: string;
  onClose: () => void;
  /** 新しいメモ・HTML メモ・フォルダ（右クリックした所に作る） */
  onCreate: (node: TreeNode | null, kind: "markdown" | "html" | "folder") => void;
  onRename: (path: string) => void;
  /** Finder で表示（"" はメモのフォルダ）。Mac のアプリでなければ出さない */
  onReveal: ((path: string) => void) | null;
  /** メモを新しいタブで開く（いくつもなら順に） */
  onOpenInNewTabs: (paths: string[]) => void;
  onTrash: (nodes: readonly { path: string; dir: boolean }[]) => void;
}

/**
 * メモのタブの一覧の右クリックのメニュー。空いている所・フォルダは新しいメモ・フォルダを作る組、行は名前の変更・Finder・パスのコピー・ゴミ箱。
 * ⌘ / Shift ＋クリックで選んだ行の 1 つを右クリックしたら、選んでいるものすべてに効く組（新しいタブで開く・パスをコピー・ゴミ箱に入れる）
 */
export function MemoListMenu({ at, target, dir, onClose, onCreate, onRename, onReveal, onOpenInNewTabs, onTrash }: Props) {
  const { node, many } = target;
  const fullPath = (path: string) => `${dir}/${path}`;
  if (many) {
    const memos = many.filter((n) => !n.dir).map((n) => n.path);
    return (
      <PopupMenu at={at} label={`選んだ ${many.length} 件の操作`} onClose={onClose}>
        {memos.length > 0 && <MenuItem onSelect={() => onOpenInNewTabs(memos)}>新しいタブで開く（{memos.length} 件）</MenuItem>}
        <MenuItem onSelect={() => void navigator.clipboard.writeText(many.map((n) => fullPath(n.path)).join("\n"))}>パスをコピー（{many.length} 件）</MenuItem>
        <MenuItem danger onSelect={() => onTrash(many)}>
          ゴミ箱に入れる…（{many.length} 件）
        </MenuItem>
      </PopupMenu>
    );
  }
  return (
    <PopupMenu at={at} label="メモの操作" onClose={onClose}>
      {node && !node.dir && <MenuItem onSelect={() => onOpenInNewTabs([node.path])}>新しいタブで開く</MenuItem>}
      {(node === null || node.dir) && (
        <>
          <MenuItem onSelect={() => onCreate(node, "markdown")}>新しいメモ</MenuItem>
          <MenuItem onSelect={() => onCreate(node, "html")}>新しい HTML メモ</MenuItem>
          <MenuItem onSelect={() => onCreate(node, "folder")}>新しいフォルダ</MenuItem>
        </>
      )}
      {node && <MenuItem onSelect={() => onRename(node.path)}>名前を変更</MenuItem>}
      {onReveal && <MenuItem onSelect={() => onReveal(node?.path ?? "")}>Finder で表示</MenuItem>}
      {node && <MenuItem onSelect={() => void navigator.clipboard.writeText(fullPath(node.path))}>パスをコピー</MenuItem>}
      {node && (
        <MenuItem danger onSelect={() => onTrash([node])}>
          ゴミ箱に入れる…
        </MenuItem>
      )}
    </PopupMenu>
  );
}
