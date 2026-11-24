import { ChevronsDownUp, ChevronsUpDown, Ellipsis, FileCode2, FilePlus, FolderOpen, FolderPlus, Sparkles, Trash2 } from "lucide-react";
import type { NoteKind } from "@shared/notes/kinds";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";

/**
 * ノートの欄の見出しの右の操作: 新しいノート（Markdown / HTML を選ぶメニュー）・新しいフォルダと、あまり使わないものをまとめた「…」
 * （AI でフォルダを整理・フォルダをすべて閉じる / 開く・Finder で開く・欄のゴミ箱。取り直しは一覧のいちばん上の見出しで、すべての欄をまとめて）。欄がいくつも並ぶので、見出しには押すことの多い 2 つだけを出す。
 * すべて閉じる / 開くは 1 つの項目で、開いているフォルダがあれば閉じる、すべて閉じていれば開く（サイドバーの「すべてのプロジェクトを閉じる / 開く」と同じ）
 */
export function NoteSectionTools({
  title,
  hasNotes,
  folds,
  onCreate,
  onCreateFolder,
  onPlan,
  onReveal,
  onOpenTrash,
}: {
  /** 欄の名前（ボタンの名前に添える。欄がいくつもあっても、どの欄の操作か読み上げで分かるように） */
  title: string;
  hasNotes: boolean;
  /** フォルダの開閉: フォルダがあるか・開いているフォルダがあるか・すべて閉じる / すべて開く */
  folds: { hasFolders: boolean; anyOpen: boolean; toggle: () => void };
  onCreate: (kind: NoteKind) => void;
  onCreateFolder: () => void;
  onPlan: () => void;
  /** 欄のフォルダを Finder で開く（Mac のアプリでなければ null） */
  onReveal: (() => void) | null;
  /** 欄のゴミ箱を開く（共通のノートだけ。ほかは null） */
  onOpenTrash: (() => void) | null;
}) {
  const newMenu = useContextMenu({ align: "end" });
  const moreMenu = useContextMenu({ align: "end" });
  const foldLabel = folds.anyOpen ? "フォルダをすべて閉じる" : "フォルダをすべて開く";
  return (
    <span className="note-section-tools">
      <IconButton
        icon={FilePlus}
        iconSize={14}
        label={`新しいノート（${title}）`}
        className="note-new-button"
        aria-haspopup="menu"
        aria-expanded={newMenu.isOpen}
        onClick={(e) => newMenu.toggle(e)}
      />
      <IconButton icon={FolderPlus} iconSize={14} label={`新しいフォルダ（${title}）`} onClick={onCreateFolder} />
      <IconButton icon={Ellipsis} iconSize={14} label={`ほかの操作（${title}）`} className="note-more-button" aria-haspopup="menu" aria-expanded={moreMenu.isOpen} onClick={(e) => moreMenu.toggle(e)} />
      {newMenu.menu && (
        <PopupMenu at={newMenu.menu.at} label="新しいノート" onClose={newMenu.close} ignore=".note-new-button">
          <MenuItem onSelect={() => onCreate("markdown")}>
            <FilePlus size={14} /> 新しいノート（Markdown）
          </MenuItem>
          <MenuItem onSelect={() => onCreate("html")}>
            <FileCode2 size={14} /> 新しい HTML ノート（HTML と CSS で書くページ）
          </MenuItem>
        </PopupMenu>
      )}
      {moreMenu.menu && (
        <PopupMenu at={moreMenu.menu.at} label={`${title}の操作`} onClose={moreMenu.close} ignore=".note-more-button">
          <MenuItem disabled={!hasNotes} onSelect={onPlan}>
            <Sparkles size={14} /> AI でフォルダを整理（案を見て、選んだものだけ動かす）
          </MenuItem>
          <MenuItem disabled={!folds.hasFolders} onSelect={folds.toggle}>
            {folds.anyOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />} {foldLabel}
          </MenuItem>
          {onReveal && (
            <MenuItem onSelect={onReveal}>
              <FolderOpen size={14} /> Finder で開く
            </MenuItem>
          )}
          {onOpenTrash && (
            <MenuItem onSelect={onOpenTrash}>
              <Trash2 size={14} /> ゴミ箱を開く（消したノートを元に戻す）
            </MenuItem>
          )}
        </PopupMenu>
      )}
    </span>
  );
}
