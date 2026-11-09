import { ChevronsDownUp, ChevronsUpDown, Ellipsis, FileCode2, FilePlus, FolderPlus, PanelLeftClose, RefreshCw, Sparkles } from "lucide-react";
import type { MemoKind } from "@shared/memo/kinds";
import { cx } from "@/lib/cx";
import { useOverflowCompact } from "@/hooks/useOverflowCompact";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";

/**
 * メモのタブの左の一覧の見出し（題名「メモ」と、新しいメモ（Markdown / HTML を選ぶメニュー）・新しいフォルダ・AI でフォルダを整理・取り直し・
 * フォルダをすべて閉じる / すべて開く・一覧を隠す）。一覧が狭くて入らないときだけ（useOverflowCompact。決め打ちの幅では切り替えない）、題名を隠し、
 * あまり使わない 3 つ（AI で整理・取り直し・すべて閉じる / 開く）を「…」のメニューにまとめる（題名が「メ…」に切れて読めなかったため）。
 * すべて閉じる / 開くは 1 つのボタンで、開いているフォルダがあれば閉じる、すべて閉じていれば開く（サイドバーの「すべてのプロジェクトを閉じる / 開く」と同じ。利用者の依頼）
 */
export function MemoListHead({
  dir,
  hasMemos,
  refreshing,
  folds,
  onCreate,
  onCreateFolder,
  onPlan,
  onRefresh,
  onHide,
}: {
  dir: string;
  hasMemos: boolean;
  refreshing: boolean;
  /** フォルダの開閉: フォルダがあるか・開いているフォルダがあるか・すべて閉じる / すべて開く */
  folds: { hasFolders: boolean; anyOpen: boolean; toggle: () => void };
  onCreate: (kind: MemoKind) => void;
  onCreateFolder: () => void;
  onPlan: () => void;
  onRefresh: () => void;
  onHide: () => void;
}) {
  const fit = useOverflowCompact<HTMLElement>(null);
  const newMenu = useContextMenu({ align: "end" });
  const moreMenu = useContextMenu({ align: "end" });
  const planLabel = "AI でフォルダを整理（案を見て、選んだものだけ動かす）";
  const foldIcon = folds.anyOpen ? ChevronsDownUp : ChevronsUpDown;
  const foldLabel = folds.anyOpen ? "フォルダをすべて閉じる" : "フォルダをすべて開く";
  return (
    <header ref={fit.ref} className={cx("changes-head", "memo-list-head", fit.compact && "compact")}>
      {!fit.compact && (
        <span className="changes-branch" title={dir}>
          メモ
        </span>
      )}
      <span className="spacer" />
      <IconButton
        icon={FilePlus}
        label="新しいメモ（Markdown / HTML）"
        className="memo-new-button"
        aria-haspopup="menu"
        aria-expanded={newMenu.isOpen}
        onClick={(e) => newMenu.toggle(e)}
      />
      <IconButton icon={FolderPlus} label="新しいフォルダ" onClick={onCreateFolder} />
      {fit.compact ? (
        <IconButton
          icon={Ellipsis}
          label={`ほかの操作（AI でフォルダを整理・取り直し・${foldLabel}）`}
          className="memo-more-button"
          aria-haspopup="menu"
          aria-expanded={moreMenu.isOpen}
          onClick={(e) => moreMenu.toggle(e)}
        />
      ) : (
        <>
          <IconButton icon={Sparkles} label={planLabel} disabled={!hasMemos} onClick={onPlan} />
          <RefreshButton label="メモの一覧を取り直す" busy={refreshing} onClick={onRefresh} />
          <IconButton icon={foldIcon} label={foldLabel} disabled={!folds.hasFolders} onClick={folds.toggle} />
        </>
      )}
      <IconButton icon={PanelLeftClose} label="メモの一覧を隠す" onClick={onHide} />
      {newMenu.menu && (
        <PopupMenu at={newMenu.menu.at} label="新しいメモ" onClose={newMenu.close} ignore=".memo-new-button">
          <MenuItem onSelect={() => onCreate("markdown")}>
            <FilePlus size={14} /> 新しいメモ（Markdown）
          </MenuItem>
          <MenuItem onSelect={() => onCreate("html")}>
            <FileCode2 size={14} /> 新しい HTML メモ（HTML と CSS で書くページ）
          </MenuItem>
        </PopupMenu>
      )}
      {moreMenu.menu && (
        <PopupMenu at={moreMenu.menu.at} label="メモの一覧の操作" onClose={moreMenu.close} ignore=".memo-more-button">
          <MenuItem disabled={!hasMemos} onSelect={onPlan}>
            <Sparkles size={14} /> {planLabel}
          </MenuItem>
          <MenuItem onSelect={onRefresh}>
            <RefreshCw size={14} /> メモの一覧を取り直す
          </MenuItem>
          <MenuItem disabled={!folds.hasFolders} onSelect={folds.toggle}>
            {folds.anyOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />} {foldLabel}
          </MenuItem>
        </PopupMenu>
      )}
    </header>
  );
}
