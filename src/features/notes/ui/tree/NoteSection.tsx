import type { LucideIcon } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";
import { isCancelKey } from "@/foundation/ui/lib/keys";
import { Collapse } from "@/foundation/ui/kit/Collapse";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { FOLD_ROW, FoldHead } from "@/foundation/ui/kit/FoldHead";
import { useFold } from "@/foundation/ui/hooks/useFold";
import { canOpenExternal } from "@/foundation/ui/external/native";
import { NoteFoundList } from "./NoteFoundList";
import { NoteListMenu } from "./NoteListMenu";
import { NotePlanDialog } from "./NotePlanDialog";
import { NoteSectionTools } from "./NoteSectionTools";
import { NoteTrashDialog } from "./NoteTrashDialog";
import { NoteTree } from "./NoteTree";
import { noteListDropProps } from "./noteDrag";
import { useNoteSection, type NoteSectionFold, type NoteSectionProps } from "./useNoteSection";

/**
 * ノートの欄 1 つ（見出し = 名前・開閉・作る操作と、1 つのプロジェクトのノートのフォルダの木）。ノートのタブ・右サイドバーのノートでは「共通のノート」と
 * いまのプロジェクトの 2 つを並べ、全ノートの画面ではプロジェクトの数だけ並べる（どの画面かは持たず、開く先・選んでいる欄・行き先の欄を受け取る）。
 * 行を押すとノートを開き、⌘ / Shift ＋クリックでいくつも選べ（まとめてドラッグ・右クリック）、ダブルクリックで名前を変える。
 * 見出し・空いている所へ落とすと欄の根へ、フォルダの行へ落とすとその中へ動かす（ほかの欄から運んできたら、ノートのチャットごと移す）
 */
export function NoteSection(props: NoteSectionProps) {
  const { projectId, title, icon, query, onActivate, moveTargets } = props;
  const s = useNoteSection(props);
  const { list, multi, menu, tree, found } = s;
  return (
    <section
      className={cx("note-section", s.dropTarget === "" && "drop-target")}
      aria-label={title}
      // 押した・ピントが入った欄を、選んでいる欄にする（ほかの欄で選んだ行は外れる）
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      // 空いている所・見出しの右クリックは、選んでいる行を外す（メニューの「新しいノート」などは欄の根に作る）
      onContextMenu={(e) => {
        s.clearPicks();
        menu.open(e, { node: null, many: null });
      }}
      // 行・探す欄・ボタンの外（欄の下の空いている所など）を押したら、選んでいる行を外す（そのまま作ると、欄の根に作る）
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest(".tree-row, button, input")) return;
        s.clearPicks();
      }}
      // Esc で、⌘ / Shift ＋クリックで選んだものを外す
      onKeyDown={(e) => {
        if (!isCancelKey(e) || multi.selected.length === 0) return;
        e.preventDefault();
        multi.clear();
      }}
      {...noteListDropProps({ projectId, onDropInto: s.dropInto, onDropTarget: s.setDropTarget })}
    >
      <FoldHead
        look={FOLD_ROW}
        className="note-section-head"
        open={s.fold.open}
        onToggle={s.fold.toggle}
        icon={icon}
        label={title}
        title={s.dir}
        actions={
          <NoteSectionTools
            title={title}
            hasNotes={s.hasNotes}
            folds={{
              hasFolders: s.dirs.length > 0,
              anyOpen: s.dirs.some((d) => s.folders.open.has(d)),
              // 開いているものがあればすべて閉じ（もうないフォルダの覚えも外す）、すべて閉じていればすべて開く
              toggle: () => (s.dirs.some((d) => s.folders.open.has(d)) ? s.folders.closeAll() : s.folders.expand(s.dirs)),
            }}
            onCreate={(kind) => void s.actions.createNote(s.folderForNew(null), kind)}
            onCreateFolder={() => void s.actions.createFolder(s.folderForNew(null))}
            onPlan={() => s.setPlanning(true)}
            onReveal={canOpenExternal() && list.data?.exists ? () => void s.reveal("") : null}
            onOpenTrash={props.showTrash ? () => s.setTrashOpen(true) : null}
          />
        }
      />
      <Collapse open={s.fold.open}>
        <ErrorText message={list.error} />
        {!list.data ? (
          !list.error && <p className="muted small changes-empty">読み込み中…</p>
        ) : found ? (
          found.length === 0 ? (
            <p className="muted small changes-empty">「{query.trim()}」に合うノートはありません。</p>
          ) : (
            <NoteFoundList found={found} isSelected={s.isSelected} onRowClick={(path, e) => s.rowClick(path, false, e)} onMenu={s.rowMenu} />
          )
        ) : tree.length === 0 ? (
          <p className="muted small changes-empty">{props.emptyHint}</p>
        ) : (
          <NoteTree
            projectId={projectId}
            nodes={tree}
            open={s.folders.open}
            onToggle={s.folders.toggle}
            isSelected={s.isSelected}
            onRowClick={(node, e) => s.rowClick(node.path, node.dir, e)}
            onMenu={s.rowMenu}
            onExpand={(path) => s.folders.expand([path])}
            onDropInto={s.dropInto}
            dragPaths={s.dragPaths}
            dropTarget={s.dropTarget}
            onDropTarget={s.setDropTarget}
            renaming={s.renaming}
            onStartRename={(node) => s.startRename(node.path)}
            onRename={(node, name) => void s.rename(node, name)}
            onRenameEnd={() => s.setRenaming(null)}
          />
        )}
        {list.data?.truncated && <p className="muted small changes-empty">ノートが多いため、途中までを表示しています。</p>}
      </Collapse>
      {menu.menu && (
        <NoteListMenu
          at={menu.menu.at}
          target={menu.menu.value}
          dir={s.dir}
          onClose={menu.close}
          onCreate={(node, kind) => void (kind === "folder" ? s.actions.createFolder(s.folderForNew(node)) : s.actions.createNote(s.folderForNew(node), kind))}
          onRename={s.startRename}
          onReveal={canOpenExternal() ? (path) => void s.reveal(path) : null}
          onOpenInNewTabs={(paths) => void s.openInNewTabs(paths)}
          onTrash={(nodes) => {
            multi.clear();
            void s.actions.trashMany(nodes);
          }}
          moveTargets={moveTargets}
          onMoveTo={s.moveTo}
        />
      )}
      {s.trashOpen && <NoteTrashDialog projectId={projectId} dir={s.dir} title={title} onClose={() => s.setTrashOpen(false)} />}
      {s.planning && <NotePlanDialog projectId={projectId} onApply={s.actions.moveMany} onClose={() => s.setPlanning(false)} />}
    </section>
  );
}

/** 欄を使えないとき（共通のノートのフォルダが重なったなど）の欄: 見出しと理由の文だけ（操作は出さない） */
export function NoteSectionNotice({ title, icon, fold, message }: { title: string; icon: LucideIcon; fold: NoteSectionFold; message: string }) {
  const { open, toggle } = useFold(fold.place, fold.key, { defaultOpen: fold.defaultOpen });
  return (
    <section className="note-section" aria-label={title}>
      <FoldHead look={FOLD_ROW} className="note-section-head" open={open} onToggle={toggle} icon={icon} label={title} />
      <Collapse open={open}>
        <p className="muted small changes-empty">{message}</p>
      </Collapse>
    </section>
  );
}
