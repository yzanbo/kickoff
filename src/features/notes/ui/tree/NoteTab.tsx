import "./NoteTab.css";
import { FileCode2, FilePlus, FolderOpen, StickyNote } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";
import { isCancelKey } from "@/foundation/ui/lib/keys";
import { notesStore } from "@/features/notes/ui/store";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { ListRail } from "@/foundation/ui/kit/ListRail";
import { SearchField } from "@/foundation/ui/kit/SearchField";
import { Panel, type PanelFrame } from "@/features/panel/ui";
import { NoteFoundList } from "./NoteFoundList";
import { NoteListHead } from "./NoteListHead";
import { NoteListMenu } from "./NoteListMenu";
import { noteListDropProps } from "./noteDrag";
import { NoteTree } from "./NoteTree";
import { NotePlanDialog } from "./NotePlanDialog";
import { canOpenExternal } from "@/foundation/ui/external/native";
import { useNoteTab, type NoteTabProps } from "./useNoteTab";

/** 右の欄は画面そのものなので、閉じる・幅を変えるなどの道具を出さない */
const FIXED_FRAME: PanelFrame = { fixed: true };

/**
 * プロジェクトの「ノート」タブ（左にノートのフォルダの木、右に開いたノート）。左の一覧は隠せる（listHidden。隠している間は左端の細い帯 ListRail に「一覧を表示」）。ノートはプロジェクトの外（設定の親フォルダの下の、
 * プロジェクトごとのフォルダ）の Markdown。openNote は URL の ?note= で来たノート（チャットの「ノートに追加」・⌘K から。開いたら URL から外す）、openNoteLine はそのノートで移る行（⌘K の「ノート内の文言」）。
 * 右は開いたノートをタブで並べるパネル（notes。チャットのパネルと同じく、タブのドラッグで上下・左右に分けられる）。一覧のノートを押すと、ピントのあるペインで表示中のノートを入れ替え、
 * 右クリックの「新しいタブで開く」で新しいタブに開く（openNoteInPanel）。一覧の選んでいる行は、ピントのあるペインで表示中のノート。⌘ / Shift ＋クリックでいくつも選べ（useMultiSelect）、まとめてドラッグで動かす・右クリックで開く・パスをコピー・ゴミ箱に入れる。最後に表示したノートは storage.ts の selected に覚え、次に開いたときに開き直す
 */
export function NoteTab(props: NoteTabProps) {
  const { projectId } = props;
  const { actions, dir, dirs, dragPaths, dropInto, dropTarget, folderForNew, folders, found, hasNotes, isSelected, list, listHidden, menu, multi, openInNewTabs, panel, planning, query, rename, renaming, reveal, rowClick, rowMenu, setDropTarget, setListHidden, setPicked, setPlanning, setQuery, setRenaming, startRename, tree, width, widthPaneRef } = useNoteTab(props);
  return (
    <div className={cx("changes", "note-tab", width.resizing && "resizing")}>
      {listHidden ? (
        // 一覧を隠している間は、左端の細い帯に戻すボタンだけを置く（ノートを開いていなくても戻せるように）
        <ListRail label="ノートの一覧を表示" onShow={() => setListHidden(false)} />
      ) : (
        <>
        <aside
          ref={widthPaneRef}
          className={cx("changes-list", "note-list", dropTarget === "" && "drop-target")}
          style={{ width: width.size }}
          aria-label="ノート"
          // 空いている所の右クリックも、選んでいる行を外す（メニューの「新しいノート」などは、いちばん外側に作る）
          onContextMenu={(e) => {
            setPicked("");
            multi.clear();
            menu.open(e, { node: null, many: null });
          }}
          // 行・見出し・探す欄の外（一覧の下の空いている所など）を押したら、選んでいる行を外す（そのまま作ると、いちばん外側に作る）
          onClick={(e) => {
            if (e.target instanceof Element && e.target.closest(".tree-row, .note-list-head, .note-search, button, input")) return;
            setPicked("");
            multi.clear();
          }}
          // Esc で、⌘ / Shift ＋クリックで選んだものを外す
          onKeyDown={(e) => {
            if (!isCancelKey(e) || multi.selected.length === 0) return;
            e.preventDefault();
            multi.clear();
          }}
          // 一覧の空いている所へ落とすと、いちばん上（直下）へ動かす
          {...noteListDropProps({ onDropInto: dropInto, onDropTarget: setDropTarget })}
        >
          <NoteListHead
            dir={dir}
            hasNotes={hasNotes}
            refreshing={list.loading}
            folds={{
              hasFolders: dirs.length > 0,
              anyOpen: dirs.some((d) => folders.open.has(d)),
              // 開いているものがあればすべて閉じ（もうないフォルダの覚えも外す）、すべて閉じていればすべて開く
              toggle: () => (dirs.some((d) => folders.open.has(d)) ? folders.closeAll() : folders.expand(dirs)),
            }}
            onCreate={(kind) => void actions.createNote(folderForNew(null), kind)}
            onCreateFolder={() => void actions.createFolder(folderForNew(null))}
            onPlan={() => setPlanning(true)}
            onRefresh={() => notesStore.invalidate(projectId)}
            onHide={() => setListHidden(true)}
          />
          <SearchField className="note-search" value={query} onChange={setQuery} placeholder="ノートを名前で探す" label="ノートを名前で探す" />
          {/* 見出しと探す欄は残し、ノートの一覧だけを流す */}
          <div className="changes-scroll">
            <ErrorText message={list.error} />
            {!list.data ? (
              !list.error && <p className="muted small changes-empty">読み込み中…</p>
            ) : found ? (
              found.length === 0 ? (
                <p className="muted small changes-empty">「{query.trim()}」に合うノートはありません。</p>
              ) : (
                <NoteFoundList found={found} isSelected={isSelected} onRowClick={(path, e) => rowClick(path, false, e)} onMenu={rowMenu} />
              )
            ) : tree.length === 0 ? (
              <p className="muted small changes-empty">まだノートはありません。上の ＋ から作るか、チャットの文を右クリックして「ノートに追加」で作れます。</p>
            ) : (
              <NoteTree
                nodes={tree}
                open={folders.open}
                onToggle={folders.toggle}
                isSelected={isSelected}
                onRowClick={(node, e) => rowClick(node.path, node.dir, e)}
                onMenu={rowMenu}
                onExpand={(path) => folders.expand([path])}
                onDropInto={dropInto}
                dragPaths={dragPaths}
                dropTarget={dropTarget}
                onDropTarget={setDropTarget}
                renaming={renaming}
                onStartRename={(node) => startRename(node.path)}
                onRename={(node, name) => void rename(node, name)}
                onRenameEnd={() => setRenaming(null)}
              />
            )}
            {list.data?.truncated && <p className="muted small changes-empty">ノートが多いため、途中までを表示しています。</p>}
          </div>
        </aside>
        <div className="pane-resizer" aria-label="一覧の幅を変える" {...width.handle} />
        </>
      )}
      <div className="changes-diff note-main">
        {panel.tabs.length > 0 ? (
          <Panel panel={panel} frame={FIXED_FRAME} />
        ) : (
          list.data && (
            <EmptyState
              icon={StickyNote}
              title={tree.length === 0 ? "ノートはまだありません" : "ノートを選んでください"}
              actions={
                <>
                  <button className="btn btn-primary" onClick={() => void actions.createNote("")}>
                    <FilePlus size={14} aria-hidden /> 新しいノート
                  </button>
                  <button className="btn" onClick={() => void actions.createNote("", "html")}>
                    <FileCode2 size={14} aria-hidden /> 新しい HTML ノート
                  </button>
                  {canOpenExternal() && list.data.exists && (
                    <button className="btn" onClick={() => void reveal("")}>
                      <FolderOpen size={14} aria-hidden /> Finder で開く
                    </button>
                  )}
                </>
              }
            >
              <p>このプロジェクトのノートは、プロジェクトの外のフォルダに Markdown（HTML のノートは HTML）で保存します。チャットの文を右クリックして「ノートに追加」でも作れます（AI に要約させることもできます）。</p>
              <p className="muted small note-dir" title={dir}>
                保存先: {dir}
              </p>
            </EmptyState>
          )
        )}
      </div>
      {menu.menu && (
        <NoteListMenu
          at={menu.menu.at}
          target={menu.menu.value}
          dir={dir}
          onClose={menu.close}
          onCreate={(node, kind) => void (kind === "folder" ? actions.createFolder(folderForNew(node)) : actions.createNote(folderForNew(node), kind))}
          onRename={startRename}
          onReveal={canOpenExternal() ? (path) => void reveal(path) : null}
          onOpenInNewTabs={(paths) => void openInNewTabs(paths)}
          onTrash={(nodes) => {
            multi.clear();
            void actions.trashMany(nodes);
          }}
        />
      )}
      {planning && <NotePlanDialog projectId={projectId} onApply={actions.moveMany} onClose={() => setPlanning(false)} />}
    </div>
  );
}
