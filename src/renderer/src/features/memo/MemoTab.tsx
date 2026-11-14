import { FileCode2, FilePlus, FolderOpen, PanelLeftOpen, StickyNote } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { TerminalTarget } from "@/features/panel/tabs/panelTypes";
import { navigate } from "@/app/router";
import { cx } from "@/lib/cx";
import { isCancelKey } from "@/lib/keys";
import { readSetting } from "@/lib/storage";
import { CHANGES_LIST_WIDTH, MEMO_LIST_HIDDEN, memoOpenFolders, memoSelected } from "@/lib/storageKeys";
import { useDragSize } from "@/hooks/useDragSize";
import { useMultiSelect } from "@/hooks/useMultiSelect";
import { useSetting } from "@/hooks/useSetting";
import { memosStore, useMemoList } from "@/stores/memos";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { SearchField } from "@/ui/SearchField";
import { useContextMenu } from "@/ui/useContextMenu";
import { folderPaths, type TreeNode } from "@/features/editor/treeModel";
import { focusedPane } from "@/features/panel/layout/paneTree";
import { Panel } from "@/features/panel/Panel";
import type { PanelFrame } from "@/features/panel/PanelTools";
import { usePanel } from "@/features/panel/usePanel";
import { ancestorsOf, buildMemoTree, filterMemos, isUnder, parentOf, topLevelPaths, visibleTreePaths } from "./memoPaths";
import { MemoFoundList } from "./MemoFoundList";
import { MemoListHead } from "./MemoListHead";
import { MemoListMenu, type MemoMenuTarget } from "./MemoListMenu";
import { memoListDropProps } from "./memoDrag";
import { MemoTree, type MemoRenaming } from "./MemoTree";
import { confirmLeaveMemosUnder } from "./memoGuards";
import { closeMemoTabsUnder, openMemoInPanel } from "./memoPanel";
import { requestMemoReveal } from "./memoReveal";
import { MemoPlanDialog } from "./MemoPlanDialog";
import { followMovedMemo, useMemoActions } from "./useMemoActions";

/** 右の欄は画面そのものなので、閉じる・幅を変えるなどの道具を出さない */
const FIXED_FRAME: PanelFrame = { fixed: true };
const NO_TERMINALS: readonly TerminalTarget[] = [];

/**
 * プロジェクトの「メモ」タブ（左にメモのフォルダの木、右に開いたメモ）。左の一覧は隠せる（MEMO_LIST_HIDDEN。隠している間は左端の細い帯に「一覧を表示」）。メモはプロジェクトの外（設定の親フォルダの下の、
 * プロジェクトごとのフォルダ）の Markdown。openMemo は URL の ?memo= で来たメモ（チャットの「メモに追加」・⌘K から。開いたら URL から外す）、openMemoLine はそのメモで移る行（⌘K の「メモ内の文言」）。
 * 右は開いたメモをタブで並べるパネル（memos。チャットのパネルと同じく、タブのドラッグで上下・左右に分けられる）。一覧のメモを押すと、ピントのあるペインで表示中のメモを入れ替え、
 * 右クリックの「新しいタブで開く」で新しいタブに開く（openMemoInPanel）。一覧の選んでいる行は、ピントのあるペインで表示中のメモ。⌘ / Shift ＋クリックでいくつも選べ（useMultiSelect）、
 * まとめてドラッグで動かす・右クリックで開く・パスをコピー・ゴミ箱に入れる。最後に表示したメモは memoSelected に覚え、次に開いたときに開き直す
 */
export function MemoTab({ projectId, openMemo, openMemoLine }: { projectId: number; openMemo?: string; openMemoLine?: number }) {
  const list = useMemoList(projectId);
  const panel = usePanel({ surface: "memos", scope: projectId, newChat: undefined, terminals: NO_TERMINALS });
  const { panelOpen, setOpen } = panel;
  // 右の欄はいつも開いておく（タブがなければ案内）
  useEffect(() => {
    if (!panelOpen) setOpen(true);
  }, [panelOpen, setOpen]);
  // 一覧の選んでいる行 = ピントのあるペインで表示中のメモ
  const focusedTab = panel.tabs.find((t) => t.key === focusedPane(panel.layout).active);
  const selected = focusedTab?.kind === "memo" ? focusedTab.path : "";
  // 一覧で選んでいる行（背景の色。利用者の依頼で、フォルダも選べ、一覧の空いている所を押すと外れる。VS Code のエクスプローラーと同じ）。
  // null = 表示中のメモに合わせる、"" = 何も選んでいない、パス = 押したフォルダ。表示中のメモが変わったら、それに合わせ直す
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [selected]);
  const highlighted = picked ?? selected;
  const [remembered, setRemembered] = useSetting(memoSelected(projectId));
  const [openList, setOpenList] = useSetting(memoOpenFolders(projectId));
  const open = useMemo(() => new Set(openList), [openList]);
  const [query, setQuery] = useState("");
  const menu = useContextMenu<MemoMenuTarget>();
  // 左の一覧の幅（エディタ・履歴タブと同じ幅を覚える）
  const width = useDragSize({ setting: CHANGES_LIST_WIDTH, min: 200, keep: 320 });
  const [listHidden, setListHidden] = useSetting(MEMO_LIST_HIDDEN);
  // ドラッグを重ねている落とす先のフォルダ（"" は直下 = 一覧ごと示す。null は重ねていない）
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 一覧の行で名前を変えているメモ・フォルダ（新しく作ったとき・ダブルクリック・右クリックの「名前を変更」）
  const [renaming, setRenaming] = useState<MemoRenaming | null>(null);
  const startRename = (path: string) => setRenaming({ path, round: 0 });

  const entries = list.data?.entries;
  const tree = useMemo(() => buildMemoTree(entries ?? []), [entries]);
  // 木のフォルダ（すべて開く・閉じるの切り替えに使う。覚えた開閉には、もうないフォルダも残っていることがあるので木から数える）
  const dirs = useMemo(() => folderPaths(tree), [tree]);
  const found = useMemo(() => (query.trim() ? filterMemos(entries ?? [], query) : null), [entries, query]);
  const dir = list.data?.dir ?? "";
  // ⌘ / Shift ＋クリックで選んだいくつかの行（利用者の依頼。Finder と同じ。範囲は見えている並び = 探していれば見つかった順、ふだんは開いているフォルダの中までの木の順）
  const allPaths = useMemo(() => (entries ?? []).map((e) => e.path), [entries]);
  const multi = useMultiSelect(allPaths, () => (found ? found.map((e) => e.path) : visibleTreePaths(tree, open)));
  const isSelected = (path: string) => (multi.selected.length > 0 ? multi.has(path) : highlighted === path);
  const nodesOf = (paths: readonly string[]) => paths.map((path) => ({ path, dir: entries?.find((e) => e.path === path)?.dir ?? false }));

  const openFolders = (paths: string[]) => setOpenList([...new Set([...openList, ...paths])]);
  // メモを開く（newTab = 新しいタブ。ふだんはピントのあるペインで表示中のメモを入れ替える。そのときは書きかけをどうするか聞く）
  const select = async (path: string, newTab = false) => {
    await openMemoInPanel(projectId, path, newTab);
    openFolders(ancestorsOf(path));
  };

  // 最後に表示したメモを覚え、タブがないまま開いたら（アプリを開き直したとき）そのメモを開き直す
  useEffect(() => {
    if (selected && selected !== remembered) setRemembered(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const entriesLoaded = list.data !== undefined;
  useEffect(() => {
    if (!entriesLoaded || openMemo || panel.tabs.length > 0 || !remembered) return;
    if (list.data?.entries.some((e) => e.path === remembered && !e.dir)) void openMemoInPanel(projectId, remembered, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesLoaded]);

  // URL で来たメモを新しいタブで開いて（開いていればそのタブ）、URL から外す（チャットの「メモに追加」のあと）。
  // 行があれば（⌘K の「メモ内の文言」）、開いたメモでその行へ移る
  useEffect(() => {
    if (!openMemo) return;
    if (openMemoLine) requestMemoReveal(projectId, openMemo, openMemoLine);
    void select(openMemo, true);
    memosStore.invalidate(projectId);
    navigate({ name: "project", id: projectId, tab: "memos" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMemo, openMemoLine]);

  /** 名前を変えた・動かした（開いているメモ・フォルダのパスを付け替える。一覧の操作と、題名での名前の変更・AI の整理案のまとめての移動で共通） */
  const moved = (from: string, to: string) => followMovedMemo(projectId, from, to);

  const actions = useMemoActions(projectId, {
    // 作ったら、探している文を消して一覧のその行を見せ、名前を変え始める（メモは右に開く）
    onCreated: (path, isDir) => {
      setQuery("");
      setListHidden(false);
      if (isDir) {
        openFolders(ancestorsOf(path));
        setPicked(path);
      } else void select(path, true);
      startRename(path);
    },
    // 開いているメモ（とその入ったフォルダ）の名前を変える・動かす・ゴミ箱に入れる前も聞く（右の欄・別ウィンドウで開いているものも）
    beforeChange: (path) => confirmLeaveMemosUnder(projectId, path),
    onMoved: (from, to) => moved(from, to),
    onTrashed: (path) => {
      closeMemoTabsUnder(projectId, path);
      // まとめてゴミ箱に入れると続けて呼ばれるので、いま覚えている値から外す
      setOpenList(readSetting(memoOpenFolders(projectId)).filter((p) => !isUnder(p, path)));
    },
  });

  // 行で書いた名前に変える。同じ名前があれば、書いた名前のまま欄を開き直して書き直してもらう
  const rename = async (node: TreeNode, name: string) => {
    const result = await actions.renameTo(node.path, node.dir, name);
    setRenaming((r) => (result === "taken" && r?.path === node.path ? { path: node.path, initial: name, round: r.round + 1 } : null));
  };

  // AI でフォルダを整理するダイアログ
  const [planning, setPlanning] = useState(false);
  const hasMemos = Boolean(entries?.some((e) => !e.dir));

  const toggle = (path: string) => setOpenList(open.has(path) ? openList.filter((p) => p !== path) : [...openList, path]);
  // 新しいメモ・フォルダを作る場所: 右クリックした行（フォルダならその中、メモならその入ったフォルダ）、なければ一覧で選んでいる行
  // （フォルダならその中、メモならその入ったフォルダ。何も選んでいなければ、いちばん外側）
  const folderForNew = (node: TreeNode | null) => {
    if (node) return node.dir ? node.path : parentOf(node.path);
    if (!highlighted) return "";
    return entries?.find((e) => e.path === highlighted)?.dir ? highlighted : parentOf(highlighted);
  };
  const reveal = (path: string) => window.kickoff?.externalApps.revealPath(path ? `${dir}/${path}` : dir);

  // 行を押した: ⌘ / Shift なら選ぶだけ（まだ何も選んでいなければ、いま選んでいる行も入れる）。ふつうのクリックは選んだものを外し、メモは開き、フォルダは開閉して選ぶ
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
    for (const path of paths) await openMemoInPanel(projectId, path, true);
  };

  return (
    <div className={cx("changes", "memo-tab", width.resizing && "resizing")}>
      {listHidden ? (
        // 一覧を隠している間は、左端の細い帯に戻すボタンだけを置く（メモを開いていなくても戻せるように）
        <div className="memo-list-rail">
          <IconButton icon={PanelLeftOpen} label="メモの一覧を表示" onClick={() => setListHidden(false)} />
        </div>
      ) : (
        <>
        <aside
          ref={width.paneRef}
          className={cx("changes-list", "memo-list", dropTarget === "" && "drop-target")}
          style={{ width: width.size }}
          aria-label="メモ"
          // 空いている所の右クリックも、選んでいる行を外す（メニューの「新しいメモ」などは、いちばん外側に作る）
          onContextMenu={(e) => {
            setPicked("");
            multi.clear();
            menu.open(e, { node: null, many: null });
          }}
          // 行・見出し・探す欄の外（一覧の下の空いている所など）を押したら、選んでいる行を外す（そのまま作ると、いちばん外側に作る）
          onClick={(e) => {
            if (e.target instanceof Element && e.target.closest(".tree-row, .memo-list-head, .memo-search, button, input")) return;
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
          {...memoListDropProps({ onDropInto: dropInto, onDropTarget: setDropTarget })}
        >
          <MemoListHead
            dir={dir}
            hasMemos={hasMemos}
            refreshing={list.loading}
            folds={{
              hasFolders: dirs.length > 0,
              anyOpen: dirs.some((d) => open.has(d)),
              // 開いているものがあればすべて閉じ（もうないフォルダの覚えも外す）、すべて閉じていればすべて開く
              toggle: () => setOpenList(dirs.some((d) => open.has(d)) ? [] : dirs),
            }}
            onCreate={(kind) => void actions.createMemo(folderForNew(null), kind)}
            onCreateFolder={() => void actions.createFolder(folderForNew(null))}
            onPlan={() => setPlanning(true)}
            onRefresh={() => memosStore.invalidate(projectId)}
            onHide={() => setListHidden(true)}
          />
          <SearchField className="memo-search" value={query} onChange={setQuery} placeholder="メモを名前で探す" label="メモを名前で探す" />
          <ErrorText message={list.error} />
          {!list.data ? (
            !list.error && <p className="muted small changes-empty">読み込み中…</p>
          ) : found ? (
            found.length === 0 ? (
              <p className="muted small changes-empty">「{query.trim()}」に合うメモはありません。</p>
            ) : (
              <MemoFoundList found={found} isSelected={isSelected} onRowClick={(path, e) => rowClick(path, false, e)} onMenu={rowMenu} />
            )
          ) : tree.length === 0 ? (
            <p className="muted small changes-empty">まだメモはありません。上の ＋ から作るか、チャットの文を右クリックして「メモに追加」で作れます。</p>
          ) : (
            <MemoTree
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
          {list.data?.truncated && <p className="muted small changes-empty">メモが多いため、途中までを表示しています。</p>}
        </aside>
        <div className="pane-resizer" aria-label="一覧の幅を変える" {...width.handle} />
        </>
      )}
      <div className="changes-diff memo-main">
        {panel.tabs.length > 0 ? (
          <Panel panel={panel} frame={FIXED_FRAME} />
        ) : (
          list.data && (
            <EmptyState
              icon={StickyNote}
              title={tree.length === 0 ? "メモはまだありません" : "メモを選んでください"}
              actions={
                <>
                  <button className="btn btn-primary" onClick={() => void actions.createMemo("")}>
                    <FilePlus size={14} aria-hidden /> 新しいメモ
                  </button>
                  <button className="btn" onClick={() => void actions.createMemo("", "html")}>
                    <FileCode2 size={14} aria-hidden /> 新しい HTML メモ
                  </button>
                  {window.kickoff && list.data.exists && (
                    <button className="btn" onClick={() => void reveal("")}>
                      <FolderOpen size={14} aria-hidden /> Finder で開く
                    </button>
                  )}
                </>
              }
            >
              <p>このプロジェクトのメモは、プロジェクトの外のフォルダに Markdown（HTML のメモは HTML）で保存します。チャットの文を右クリックして「メモに追加」でも作れます（AI に要約させることもできます）。</p>
              <p className="muted small memo-dir" title={dir}>
                保存先: {dir}
              </p>
            </EmptyState>
          )
        )}
      </div>
      {menu.menu && (
        <MemoListMenu
          at={menu.menu.at}
          target={menu.menu.value}
          dir={dir}
          onClose={menu.close}
          onCreate={(node, kind) => void (kind === "folder" ? actions.createFolder(folderForNew(node)) : actions.createMemo(folderForNew(node), kind))}
          onRename={startRename}
          onReveal={window.kickoff ? (path) => void reveal(path) : null}
          onOpenInNewTabs={(paths) => void openInNewTabs(paths)}
          onTrash={(nodes) => {
            multi.clear();
            void actions.trashMany(nodes);
          }}
        />
      )}
      {planning && <MemoPlanDialog projectId={projectId} onApply={actions.moveMany} onClose={() => setPlanning(false)} />}
    </div>
  );
}
