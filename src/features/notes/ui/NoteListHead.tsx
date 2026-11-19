import { ChevronsDownUp, ChevronsUpDown, Ellipsis, FileCode2, FilePlus, FolderPlus, RefreshCw, Sparkles } from "lucide-react";
import type { NoteKind } from "@shared/notes/kinds";
import { cx } from "@/foundation/ui/lib/cx";
import { useOverflowCompact } from "@/foundation/ui/hooks/useOverflowCompact";
import { IconButton, RefreshButton } from "@/foundation/ui/kit/IconButton";
import { ListHideButton } from "@/foundation/ui/kit/ListRail";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";

/**
 * ノートのタブの左の一覧の見出し（題名「ノート」と、新しいノート（Markdown / HTML を選ぶメニュー）・新しいフォルダ・AI でフォルダを整理・取り直し・
 * フォルダをすべて閉じる / すべて開く・一覧を隠す）。一覧が狭くて入らないときだけ（useOverflowCompact。決め打ちの幅では切り替えない）、題名を隠し、
 * あまり使わない 3 つ（AI で整理・取り直し・すべて閉じる / 開く）を「…」のメニューにまとめる（題名が「メ…」に切れて読めなかったため）。
 * すべて閉じる / 開くは 1 つのボタンで、開いているフォルダがあれば閉じる、すべて閉じていれば開く（サイドバーの「すべてのプロジェクトを閉じる / 開く」と同じ）
 */
export function NoteListHead({
  dir,
  hasNotes,
  refreshing,
  folds,
  onCreate,
  onCreateFolder,
  onPlan,
  onRefresh,
  onHide,
}: {
  dir: string;
  hasNotes: boolean;
  refreshing: boolean;
  /** フォルダの開閉: フォルダがあるか・開いているフォルダがあるか・すべて閉じる / すべて開く */
  folds: { hasFolders: boolean; anyOpen: boolean; toggle: () => void };
  onCreate: (kind: NoteKind) => void;
  onCreateFolder: () => void;
  onPlan: () => void;
  onRefresh: () => void;
  onHide: () => void;
}) {
  const { ref: fitRef, ...fit } = useOverflowCompact<HTMLElement>(null);
  const newMenu = useContextMenu({ align: "end" });
  const moreMenu = useContextMenu({ align: "end" });
  const planLabel = "AI でフォルダを整理（案を見て、選んだものだけ動かす）";
  const foldIcon = folds.anyOpen ? ChevronsDownUp : ChevronsUpDown;
  const foldLabel = folds.anyOpen ? "フォルダをすべて閉じる" : "フォルダをすべて開く";
  return (
    <header ref={fitRef} className={cx("changes-head", "note-list-head", fit.compact && "compact")}>
      {!fit.compact && (
        <span className="changes-branch" title={dir}>
          ノート
        </span>
      )}
      <span className="spacer" />
      <IconButton
        icon={FilePlus}
        label="新しいノート（Markdown / HTML）"
        className="note-new-button"
        aria-haspopup="menu"
        aria-expanded={newMenu.isOpen}
        onClick={(e) => newMenu.toggle(e)}
      />
      <IconButton icon={FolderPlus} label="新しいフォルダ" onClick={onCreateFolder} />
      {fit.compact ? (
        <IconButton
          icon={Ellipsis}
          label={`ほかの操作（AI でフォルダを整理・取り直し・${foldLabel}）`}
          className="note-more-button"
          aria-haspopup="menu"
          aria-expanded={moreMenu.isOpen}
          onClick={(e) => moreMenu.toggle(e)}
        />
      ) : (
        <>
          <IconButton icon={Sparkles} label={planLabel} disabled={!hasNotes} onClick={onPlan} />
          <RefreshButton label="ノートの一覧を取り直す" busy={refreshing} onClick={onRefresh} />
          <IconButton icon={foldIcon} label={foldLabel} disabled={!folds.hasFolders} onClick={folds.toggle} />
        </>
      )}
      <ListHideButton label="ノートの一覧を隠す" onHide={onHide} />
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
        <PopupMenu at={moreMenu.menu.at} label="ノートの一覧の操作" onClose={moreMenu.close} ignore=".note-more-button">
          <MenuItem disabled={!hasNotes} onSelect={onPlan}>
            <Sparkles size={14} /> {planLabel}
          </MenuItem>
          <MenuItem onSelect={onRefresh}>
            <RefreshCw size={14} /> ノートの一覧を取り直す
          </MenuItem>
          <MenuItem disabled={!folds.hasFolders} onSelect={folds.toggle}>
            {folds.anyOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />} {foldLabel}
          </MenuItem>
        </PopupMenu>
      )}
    </header>
  );
}
