import type { Placement } from "@/foundation/ui/lib/floating";
import type { TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { MenuSub } from "@/foundation/ui/kit/MenuFlyout";

/** 一覧の右クリックで指したもの（node: 右クリックした行。null = 空いている所。many: 選んだいくつかの行の 1 つを右クリックしたときの、選んでいるものすべて） */
export interface NoteMenuTarget {
  node: TreeNode | null;
  many: readonly { path: string; dir: boolean }[] | null;
}

/** 右クリックの「〜へ移す」の行き先の欄（ドラッグできない場面のため。動かす先は欄の根） */
export interface NoteMoveTarget {
  projectId: number;
  /** 欄の名前（行き先が多くて「ほかの欄へ移す」の横に並べるときの文） */
  name: string;
  /** メニューにそのまま並べるときの文（「共通のノートへ移す」など） */
  label: string;
}

/** 行き先がこれより多ければ、「ほかの欄へ移す」の横に開く子のメニューにまとめる（全ノートの画面ではプロジェクトの数だけ並ぶため） */
const FLAT_MOVE_TARGETS = 2;

interface Props {
  at: Placement;
  target: NoteMenuTarget;
  /** ノートのフォルダ（パスをコピーの頭） */
  dir: string;
  onClose: () => void;
  /** 新しいノート・HTML ノート・フォルダ（右クリックした所に作る） */
  onCreate: (node: TreeNode | null, kind: "markdown" | "html" | "folder") => void;
  onRename: (path: string) => void;
  /** Finder で表示（"" はノートのフォルダ）。Mac のアプリでなければ出さない */
  onReveal: ((path: string) => void) | null;
  /** ノートを新しいタブで開く（いくつもなら順に） */
  onOpenInNewTabs: (paths: string[]) => void;
  onTrash: (nodes: readonly { path: string; dir: boolean }[]) => void;
  /** ほかの欄へ移す行き先（ノートのチャットも一緒に移る） */
  moveTargets: readonly NoteMoveTarget[];
  onMoveTo: (projectId: number, nodes: readonly { path: string; dir: boolean }[]) => void;
}

/**
 * ノートのタブの一覧の右クリックのメニュー。空いている所・フォルダは新しいノート・フォルダを作る組、行は名前の変更・Finder・パスのコピー・ゴミ箱。
 * ⌘ / Shift ＋クリックで選んだ行の 1 つを右クリックしたら、選んでいるものすべてに効く組（新しいタブで開く・パスをコピー・ほかの欄へ移す・ゴミ箱に入れる）。
 * 行には、ほかの欄（共通のノート・プロジェクト）の根へ移す項目も出す
 */
export function NoteListMenu({ at, target, dir, onClose, onCreate, onRename, onReveal, onOpenInNewTabs, onTrash, moveTargets, onMoveTo }: Props) {
  const { node, many } = target;
  const fullPath = (path: string) => `${dir}/${path}`;
  const moveItems = (nodes: readonly { path: string; dir: boolean }[]) => {
    const count = nodes.length > 1 ? `（${nodes.length} 件）` : "";
    if (moveTargets.length <= FLAT_MOVE_TARGETS)
      return moveTargets.map((t) => (
        <MenuItem key={t.projectId} onSelect={() => onMoveTo(t.projectId, nodes)}>
          {t.label}
          {count}
        </MenuItem>
      ));
    return (
      <MenuSub label={`ほかの欄へ移す${count}`} menuLabel="移す先の欄">
        {moveTargets.map((t) => (
          <MenuItem key={t.projectId} onSelect={() => onMoveTo(t.projectId, nodes)}>
            {t.name}
          </MenuItem>
        ))}
      </MenuSub>
    );
  };
  if (many) {
    const notes = many.filter((n) => !n.dir).map((n) => n.path);
    return (
      <PopupMenu at={at} label={`選んだ ${many.length} 件の操作`} onClose={onClose}>
        {notes.length > 0 && <MenuItem onSelect={() => onOpenInNewTabs(notes)}>新しいタブで開く（{notes.length} 件）</MenuItem>}
        <MenuItem onSelect={() => void navigator.clipboard.writeText(many.map((n) => fullPath(n.path)).join("\n"))}>パスをコピー（{many.length} 件）</MenuItem>
        {moveItems(many)}
        <MenuItem danger onSelect={() => onTrash(many)}>
          ゴミ箱に入れる…（{many.length} 件）
        </MenuItem>
      </PopupMenu>
    );
  }
  return (
    <PopupMenu at={at} label="ノートの操作" onClose={onClose}>
      {node && !node.dir && <MenuItem onSelect={() => onOpenInNewTabs([node.path])}>新しいタブで開く</MenuItem>}
      {(node === null || node.dir) && (
        <>
          <MenuItem onSelect={() => onCreate(node, "markdown")}>新しいノート</MenuItem>
          <MenuItem onSelect={() => onCreate(node, "html")}>新しい HTML ノート</MenuItem>
          <MenuItem onSelect={() => onCreate(node, "folder")}>新しいフォルダ</MenuItem>
        </>
      )}
      {node && <MenuItem onSelect={() => onRename(node.path)}>名前を変更</MenuItem>}
      {onReveal && <MenuItem onSelect={() => onReveal(node?.path ?? "")}>Finder で表示</MenuItem>}
      {node && <MenuItem onSelect={() => void navigator.clipboard.writeText(fullPath(node.path))}>パスをコピー</MenuItem>}
      {node && moveItems([node])}
      {node && (
        <MenuItem danger onSelect={() => onTrash([node])}>
          ゴミ箱に入れる…
        </MenuItem>
      )}
    </PopupMenu>
  );
}
