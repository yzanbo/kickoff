import { FileCode2, FilePlus, FolderOpen, StickyNote } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState, type MouseEvent } from "react";
import type { TerminalTarget } from "@/features/panel/ui/tabs/panelTypes";
import { navigate } from "@/foundation/ui/navigation/router";
import { cx } from "@/foundation/ui/lib/cx";
import { isCancelKey } from "@/foundation/ui/lib/keys";
import { readSetting } from "@/foundation/ui/storage";
import { filesSettings } from "@/features/files/ui";
import { storage } from "./storage";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useMultiSelect } from "@/foundation/ui/hooks/useMultiSelect";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { notesStore, useNoteList } from "@/features/notes/ui/stores/notes";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { ListRail } from "@/foundation/ui/kit/ListRail";
import { SearchField } from "@/foundation/ui/kit/SearchField";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { folderPaths, topLevelPaths, visibleTreePaths, type TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { focusedPane } from "@/features/panel/ui/layout/paneTree";
import { Panel } from "@/features/panel/ui/Panel";
import type { PanelFrame } from "@/features/panel/ui/PanelTools";
import { usePanel } from "@/features/panel/ui/usePanel";
import type { PanelScope } from "@/features/panel/ui/surfaces";
import { ancestorsOf, buildNoteTree, filterNotes, isUnder, parentOf } from "./notePaths";
import { NoteFoundList } from "./NoteFoundList";
import { NoteListHead } from "./NoteListHead";
import { NoteListMenu, type NoteMenuTarget } from "./NoteListMenu";
import { noteListDropProps } from "./noteDrag";
import { NoteTree, type NoteRenaming } from "./NoteTree";
import { confirmLeaveNotesUnder } from "./noteGuards";
import { closeNoteTabsUnder, notePanelKey, openNoteInPanel } from "./notePanel";
import { requestNoteReveal } from "./noteReveal";
import { NotePlanDialog } from "./NotePlanDialog";
import { followMovedNote, useNoteActions } from "./useNoteActions";
import { canOpenExternal, openExternal } from "@/foundation/ui/external/native";

/** 右の欄は画面そのものなので、閉じる・幅を変えるなどの道具を出さない */
const FIXED_FRAME: PanelFrame = { fixed: true };
const NO_TERMINALS: readonly TerminalTarget[] = [];

/**
 * プロジェクトの「ノート」タブ（左にノートのフォルダの木、右に開いたノート）。左の一覧は隠せる（listHidden。隠している間は左端の細い帯 ListRail に「一覧を表示」）。ノートはプロジェクトの外（設定の親フォルダの下の、
 * プロジェクトごとのフォルダ）の Markdown。openNote は URL の ?note= で来たノート（チャットの「ノートに追加」・⌘K から。開いたら URL から外す）、openNoteLine はそのノートで移る行（⌘K の「ノート内の文言」）。
 * 右は開いたノートをタブで並べるパネル（notes。チャットのパネルと同じく、タブのドラッグで上下・左右に分けられる）。一覧のノートを押すと、ピントのあるペインで表示中のノートを入れ替え、
 * 右クリックの「新しいタブで開く」で新しいタブに開く（openNoteInPanel）。一覧の選んでいる行は、ピントのあるペインで表示中のノート。⌘ / Shift ＋クリックでいくつも選べ（useMultiSelect）、まとめてドラッグで動かす・右クリックで開く・パスをコピー・ゴミ箱に入れる。最後に表示したノートは storage.ts の selected に覚え、次に開いたときに開き直す
 */
export function NoteTab({
  projectId,
  openNote,
  openNoteLine,
  scope,
  onOpenedNote,
}: {
  projectId: number;
  openNote?: string;
  openNoteLine?: number;
  /** 右のタブの欄を覚える範囲（なければプロジェクト。右サイドバーのノートは、真ん中のノートのタブと別の範囲） */
  scope?: PanelScope;
  /** openNote を開いたとき（あれば URL を書き換えない。右サイドバーは頼みを片付けるだけで、画面を移らない） */
  onOpenedNote?: () => void;
}) {
  const list = useNoteList(projectId);
  const panelKeyOf = notePanelKey(projectId, scope);
  const panel = usePanel({ surface: "notes", scope: scope ?? projectId, newChat: undefined, terminals: NO_TERMINALS });
  const { panelOpen, setOpen } = panel;
  // 右の欄はいつも開いておく（タブがなければ案内）
  useEffect(() => {
    if (!panelOpen) setOpen(true);
  }, [panelOpen, setOpen]);
  // 一覧の選んでいる行 = ピントのあるペインで表示中のノート
  const focusedTab = panel.tabs.find((t) => t.key === focusedPane(panel.layout).active);
  const selected = focusedTab?.kind === "note" ? focusedTab.path : "";
  // 一覧で選んでいる行（背景の色。フォルダも選べ、一覧の空いている所を押すと外れる。VS Code のエクスプローラーと同じ）。
  // null = 表示中のノートに合わせる、"" = 何も選んでいない、パス = 押したフォルダ。表示中のノートが変わったら、それに合わせ直す
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [selected]);
  const highlighted = picked ?? selected;
  const [remembered, setRemembered] = useSetting(storage.settings.selected(projectId));
  const [openList, setOpenList] = useSetting(storage.settings.openFolders(projectId));
  const open = useMemo(() => new Set(openList), [openList]);
  const [query, setQuery] = useState("");
  const menu = useContextMenu<NoteMenuTarget>();
  // 左の一覧の幅（エディタ・履歴タブと同じ幅を覚える）
  const { paneRef: widthPaneRef, ...width } = useDragSize({ setting: filesSettings.listWidth, min: 200, keep: 320 });
  const [listHidden, setListHidden] = useSetting(storage.settings.listHidden);
  // ドラッグを重ねている落とす先のフォルダ（"" は直下 = 一覧ごと示す。null は重ねていない）
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 一覧の行で名前を変えているノート・フォルダ（新しく作ったとき・ダブルクリック・右クリックの「名前を変更」）
  const [renaming, setRenaming] = useState<NoteRenaming | null>(null);
  const startRename = (path: string) => setRenaming({ path, round: 0 });

  const entries = list.data?.entries;
  const tree = useMemo(() => buildNoteTree(entries ?? []), [entries]);
  // 木のフォルダ（すべて開く・閉じるの切り替えに使う。覚えた開閉には、もうないフォルダも残っていることがあるので木から数える）
  const dirs = useMemo(() => folderPaths(tree), [tree]);
  const found = useMemo(() => (query.trim() ? filterNotes(entries ?? [], query) : null), [entries, query]);
  const dir = list.data?.dir ?? "";
  // ⌘ / Shift ＋クリックで選んだいくつかの行（Finder と同じ。範囲は見えている並び = 探していれば見つかった順、ふだんは開いているフォルダの中までの木の順）
  const allPaths = useMemo(() => (entries ?? []).map((e) => e.path), [entries]);
  const multi = useMultiSelect(allPaths, () => (found ? found.map((e) => e.path) : visibleTreePaths(tree, open)));
  const isSelected = (path: string) => (multi.selected.length > 0 ? multi.has(path) : highlighted === path);
  const nodesOf = (paths: readonly string[]) => paths.map((path) => ({ path, dir: entries?.find((e) => e.path === path)?.dir ?? false }));

  const openFolders = (paths: string[]) => setOpenList([...new Set([...openList, ...paths])]);
  // ノートを開く（newTab = 新しいタブ。ふだんはピントのあるペインで表示中のノートを入れ替える。そのときは書きかけをどうするか聞く）
  const select = async (path: string, newTab = false) => {
    await openNoteInPanel(projectId, path, newTab, panelKeyOf);
    openFolders(ancestorsOf(path));
  };

  // 最後に表示したノートを覚え、タブがないまま開いたら（アプリを開き直したとき）そのノートを開き直す（覚え直すのは表示したノートが変わったときだけ。開き直すのは一覧が届いたときだけ）
  const rememberShown = useEffectEvent((path: string) => {
    if (path !== remembered) setRemembered(path);
  });
  useEffect(() => {
    if (selected) rememberShown(selected);
  }, [selected]);
  const entriesLoaded = list.data !== undefined;
  const reopenRemembered = useEffectEvent(() => {
    if (openNote || panel.tabs.length > 0 || !remembered) return;
    if (list.data?.entries.some((e) => e.path === remembered && !e.dir)) void openNoteInPanel(projectId, remembered, true, panelKeyOf);
  });
  useEffect(() => {
    if (entriesLoaded) reopenRemembered();
  }, [entriesLoaded]);

  // URL で来たノートを新しいタブで開いて（開いていればそのタブ）、URL から外す（チャットの「ノートに追加」のあと）。
  // 行があれば（⌘K の「ノート内の文言」）、開いたノートでその行へ移る
  const openFromUrl = useEffectEvent((path: string, line: number | undefined) => {
    if (line) requestNoteReveal(projectId, path, line);
    void select(path, true);
    notesStore.invalidate(projectId);
    if (onOpenedNote) onOpenedNote();
    else navigate({ name: "project", id: projectId, tab: "notes" }, { replace: true });
  });
  useEffect(() => {
    if (openNote) openFromUrl(openNote, openNoteLine);
  }, [openNote, openNoteLine]);

  /** 名前を変えた・動かした（開いているノート・フォルダのパスを付け替える。一覧の操作と、題名での名前の変更・AI の整理案のまとめての移動で共通） */
  const moved = (from: string, to: string) => followMovedNote(projectId, from, to);

  const actions = useNoteActions(projectId, {
    // 作ったら、探している文を消して一覧のその行を見せ、名前を変え始める（ノートは右に開く）
    onCreated: (path, isDir) => {
      setQuery("");
      setListHidden(false);
      if (isDir) {
        openFolders(ancestorsOf(path));
        setPicked(path);
      } else void select(path, true);
      startRename(path);
    },
    // 開いているノート（とその入ったフォルダ）の名前を変える・動かす・ゴミ箱に入れる前も聞く（右の欄・別ウィンドウで開いているものも）
    beforeChange: (path) => confirmLeaveNotesUnder(projectId, path),
    onMoved: (from, to) => moved(from, to),
    onTrashed: (path) => {
      closeNoteTabsUnder(projectId, path);
      // まとめてゴミ箱に入れると続けて呼ばれるので、いま覚えている値から外す
      setOpenList(readSetting(storage.settings.openFolders(projectId)).filter((p) => !isUnder(p, path)));
    },
  });

  // 行で書いた名前に変える。同じ名前があれば、書いた名前のまま欄を開き直して書き直してもらう
  const rename = async (node: TreeNode, name: string) => {
    const result = await actions.renameTo(node.path, node.dir, name);
    setRenaming((r) => (result === "taken" && r?.path === node.path ? { path: node.path, initial: name, round: r.round + 1 } : null));
  };

  // AI でフォルダを整理するダイアログ
  const [planning, setPlanning] = useState(false);
  const hasNotes = Boolean(entries?.some((e) => !e.dir));

  const toggle = (path: string) => setOpenList(open.has(path) ? openList.filter((p) => p !== path) : [...openList, path]);
  // 新しいノート・フォルダを作る場所: 右クリックした行（フォルダならその中、ノートならその入ったフォルダ）、なければ一覧で選んでいる行
  // （フォルダならその中、ノートならその入ったフォルダ。何も選んでいなければ、いちばん外側）
  const folderForNew = (node: TreeNode | null) => {
    if (node) return node.dir ? node.path : parentOf(node.path);
    if (!highlighted) return "";
    return entries?.find((e) => e.path === highlighted)?.dir ? highlighted : parentOf(highlighted);
  };
  const reveal = (path: string) => openExternal({ kind: "reveal", path: path ? `${dir}/${path}` : dir });

  // 行を押した: ⌘ / Shift なら選ぶだけ（まだ何も選んでいなければ、いま選んでいる行も入れる）。ふつうのクリックは選んだものを外し、ノートは開き、フォルダは開閉して選ぶ
  const rowClick = (path: string, isDir: boolean, e: MouseEvent) => {
    if (multi.click(e, path, highlighted || null)) return;
    if (isDir) {
      setPicked(path);
      toggle(path);
    } else {
      setPicked(null);
      void select(path);
    }
  };
  // 右クリック: 選んだいくつかの行の 1 つなら、選んでいるものすべてのメニュー。ほかの行なら選んだものを外して、その行のメニュー
  const rowMenu = (e: MouseEvent, node: TreeNode) => {
    e.stopPropagation();
    if (multi.has(node.path) && multi.selected.length > 1) return menu.open(e, { node, many: nodesOf(multi.selected) });
    multi.clear();
    menu.open(e, { node, many: null });
  };
  // 選んだ行をつかめば、選んでいるものすべてを運ぶ（フォルダとその中を両方選んでいれば、フォルダだけ）
  const dragPaths = (node: TreeNode) => (multi.has(node.path) && multi.selected.length > 1 ? topLevelPaths(multi.selected) : [node.path]);
  const dropInto = (paths: string[], folder: string) => void actions.moveAllInto(paths, folder);
  const openInNewTabs = async (paths: string[]) => {
    for (const path of paths) await openNoteInPanel(projectId, path, true, panelKeyOf);
  };

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
              anyOpen: dirs.some((d) => open.has(d)),
              // 開いているものがあればすべて閉じ（もうないフォルダの覚えも外す）、すべて閉じていればすべて開く
              toggle: () => setOpenList(dirs.some((d) => open.has(d)) ? [] : dirs),
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
                open={open}
                isSelected={isSelected}
                onRowClick={(node, e) => rowClick(node.path, node.dir, e)}
                onMenu={rowMenu}
                onExpand={(path) => openFolders([path])}
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
