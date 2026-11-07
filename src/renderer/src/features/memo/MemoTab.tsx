import { FileCode2, FilePlus, FolderOpen, PanelLeftOpen, StickyNote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TerminalTarget } from "@/features/panel/tabs/panelTypes";
import { navigate } from "@/app/router";
import { cx } from "@/lib/cx";
import { CHANGES_LIST_WIDTH, MEMO_LIST_HIDDEN, memoOpenFolders, memoSelected } from "@/lib/storageKeys";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import { memosStore, useMemoList } from "@/stores/memos";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { SearchField } from "@/ui/SearchField";
import { useContextMenu } from "@/ui/useContextMenu";
import type { TreeNode } from "@/features/editor/treeModel";
import { FileIcon } from "@/features/editor/FileIcon";
import { focusedPane } from "@/features/panel/layout/paneTree";
import { Panel } from "@/features/panel/Panel";
import type { PanelFrame } from "@/features/panel/PanelTools";
import { usePanel } from "@/features/panel/usePanel";
import { ancestorsOf, baseName, buildMemoTree, filterMemos, isUnder, parentOf } from "./memoPaths";
import { MemoListHead } from "./MemoListHead";
import { memoListDropProps } from "./memoDrag";
import { MemoTree, type MemoRenaming } from "./MemoTree";
import { confirmLeaveMemosUnder } from "./memoGuards";
import { closeMemoTabsUnder, openMemoInPanel } from "./memoPanel";
import { MemoPlanDialog } from "./MemoPlanDialog";
import { followMovedMemo, useMemoActions } from "./useMemoActions";

/** 右の欄は画面そのものなので、閉じる・幅を変えるなどの道具を出さない */
const FIXED_FRAME: PanelFrame = { fixed: true };
const NO_TERMINALS: readonly TerminalTarget[] = [];

/**
 * プロジェクトの「メモ」タブ（左にメモのフォルダの木、右に開いたメモ）。左の一覧は隠せる（MEMO_LIST_HIDDEN。隠している間は左端の細い帯に「一覧を表示」）。メモはプロジェクトの外（設定の親フォルダの下の、
 * プロジェクトごとのフォルダ）の Markdown。openMemo は URL の ?memo= で来たメモ（チャットの「メモに追加」から。開いたら URL から外す）。
 * 右は開いたメモをタブで並べるパネル（memos。チャットのパネルと同じく、タブのドラッグで上下・左右に分けられる）。一覧のメモを押すと、ピントのあるペインで表示中のメモを入れ替え、
 * ⌘クリックで新しいタブに開く（openMemoInPanel）。一覧の選んでいる行は、ピントのあるペインで表示中のメモ。最後に表示したメモは memoSelected に覚え、次に開いたときに開き直す
 */
export function MemoTab({ projectId, openMemo }: { projectId: number; openMemo?: string }) {
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
  const [remembered, setRemembered] = useSetting(memoSelected(projectId));
  const [openList, setOpenList] = useSetting(memoOpenFolders(projectId));
  const open = useMemo(() => new Set(openList), [openList]);
  const [query, setQuery] = useState("");
  const menu = useContextMenu<TreeNode | null>();
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
  const found = useMemo(() => (query.trim() ? filterMemos(entries ?? [], query) : null), [entries, query]);
  const dir = list.data?.dir ?? "";

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

  // URL で来たメモを新しいタブで開いて（開いていればそのタブ）、URL から外す（チャットの「メモに追加」のあと）
  useEffect(() => {
    if (!openMemo) return;
    void select(openMemo, true);
    memosStore.invalidate(projectId);
    navigate({ name: "project", id: projectId, tab: "memos" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMemo]);

  /** 名前を変えた・動かした（開いているメモ・フォルダのパスを付け替える。一覧の操作と、題名での名前の変更・AI の整理案のまとめての移動で共通） */
  const moved = (from: string, to: string) => followMovedMemo(projectId, from, to);

  const actions = useMemoActions(projectId, {
    // 作ったら、探している文を消して一覧のその行を見せ、名前を変え始める（メモは右に開く）
    onCreated: (path, isDir) => {
      setQuery("");
      setListHidden(false);
      if (isDir) openFolders(ancestorsOf(path));
      else void select(path, true);
      startRename(path);
    },
    // 開いているメモ（とその入ったフォルダ）の名前を変える・動かす・ゴミ箱に入れる前も聞く（右の欄・別ウィンドウで開いているものも）
    beforeChange: (path) => confirmLeaveMemosUnder(projectId, path),
    onMoved: (from, to) => moved(from, to),
    onTrashed: (path) => {
      closeMemoTabsUnder(projectId, path);
      setOpenList(openList.filter((p) => !isUnder(p, path)));
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
  const folderForNew = (node: TreeNode | null) => (node ? (node.dir ? node.path : parentOf(node.path)) : selected ? parentOf(selected) : "");
  const reveal = (path: string) => window.kickoff?.externalApps.revealPath(path ? `${dir}/${path}` : dir);

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
          onContextMenu={(e) => menu.open(e, null)}
          // 一覧の空いている所へ落とすと、いちばん上（直下）へ動かす
          {...memoListDropProps({ onDropInto: (path, folder) => void actions.moveInto(path, folder), onDropTarget: setDropTarget })}
        >
          <MemoListHead
            dir={dir}
            hasMemos={hasMemos}
            refreshing={list.loading}
            canCollapse={openList.length > 0}
            onCreate={(kind) => void actions.createMemo(folderForNew(null), kind)}
            onCreateFolder={() => void actions.createFolder(folderForNew(null))}
            onPlan={() => setPlanning(true)}
            onRefresh={() => memosStore.invalidate(projectId)}
            onCollapse={() => setOpenList([])}
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
              <ul className="memo-found" role="listbox" aria-label="見つかったメモ">
                {found.map((e) => (
                  <li key={e.path}>
                    <button
                      role="option"
                      aria-selected={selected === e.path}
                      className={cx("tree-row", selected === e.path && "selected")}
                      onClick={(ev) => void select(e.path, ev.metaKey || ev.ctrlKey)}
                    >
                      <FileIcon name={baseName(e.path)} dir={false} />
                      <span className="tree-name">{baseName(e.path)}</span>
                      {parentOf(e.path) && <span className="memo-found-folder">{parentOf(e.path)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : tree.length === 0 ? (
            <p className="muted small changes-empty">まだメモはありません。上の ＋ から作るか、チャットの文を右クリックして「メモに追加」で作れます。</p>
          ) : (
            <MemoTree
              nodes={tree}
              open={open}
              onToggle={toggle}
              selected={selected || undefined}
              onSelect={(path, newTab) => void select(path, newTab)}
              onMenu={(e, node) => menu.open(e, node)}
              onExpand={(path) => openFolders([path])}
              onDropInto={(path, folder) => void actions.moveInto(path, folder)}
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
        <PopupMenu at={menu.menu.at} label="メモの操作" onClose={menu.close}>
          {(menu.menu.value === null || menu.menu.value.dir) && (
            <>
              <MenuItem onSelect={() => void actions.createMemo(folderForNew(menu.menu?.value ?? null))}>新しいメモ</MenuItem>
              <MenuItem onSelect={() => void actions.createMemo(folderForNew(menu.menu?.value ?? null), "html")}>新しい HTML メモ</MenuItem>
              <MenuItem onSelect={() => void actions.createFolder(folderForNew(menu.menu?.value ?? null))}>新しいフォルダ</MenuItem>
            </>
          )}
          {menu.menu.value && (
            <MenuItem onSelect={() => menu.menu?.value && startRename(menu.menu.value.path)}>名前を変更</MenuItem>
          )}
          {window.kickoff && <MenuItem onSelect={() => void reveal(menu.menu?.value?.path ?? "")}>Finder で表示</MenuItem>}
          {menu.menu.value && (
            <MenuItem onSelect={() => void navigator.clipboard.writeText(`${dir}/${menu.menu?.value?.path ?? ""}`)}>パスをコピー</MenuItem>
          )}
          {menu.menu.value && (
            <MenuItem danger onSelect={() => menu.menu?.value && void actions.trash(menu.menu.value.path, menu.menu.value.dir)}>
              ゴミ箱に入れる…
            </MenuItem>
          )}
        </PopupMenu>
      )}
      {planning && <MemoPlanDialog projectId={projectId} onApply={actions.moveMany} onClose={() => setPlanning(false)} />}
    </div>
  );
}
