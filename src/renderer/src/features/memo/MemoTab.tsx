import { ChevronsDownUp, FilePlus, FolderOpen, FolderPlus, StickyNote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { navigate } from "@/app/router";
import { cx } from "@/lib/cx";
import { CHANGES_LIST_WIDTH, memoOpenFolders, memoSelected } from "@/lib/storageKeys";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import { memosStore, useMemoList } from "@/stores/memos";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { SearchField } from "@/ui/SearchField";
import { useContextMenu } from "@/ui/useContextMenu";
import type { TreeNode } from "@/features/editor/treeModel";
import { FileIcon } from "@/features/editor/FileIcon";
import { ancestorsOf, baseName, buildMemoTree, filterMemos, isUnder, parentOf, remapPath } from "./memoPaths";
import { isMemoDrag, MEMO_DRAG_TYPE, MemoTree } from "./MemoTree";
import { MemoView } from "./MemoView";
import { remapPaths, useMemoActions } from "./useMemoActions";

/**
 * プロジェクトの「メモ」タブ（左にメモのフォルダの木、右に開いたメモ）。メモはプロジェクトの外（設定の親フォルダの下の、
 * プロジェクトごとのフォルダ）の Markdown。openMemo は URL の ?memo= で来たメモ（チャットの「メモに追加」から。開いたら URL から外す）
 */
export function MemoTab({ projectId, openMemo }: { projectId: number; openMemo?: string }) {
  const list = useMemoList(projectId);
  const [selected, setSelected] = useSetting(memoSelected(projectId));
  const [openList, setOpenList] = useSetting(memoOpenFolders(projectId));
  const open = useMemo(() => new Set(openList), [openList]);
  const [query, setQuery] = useState("");
  const menu = useContextMenu<TreeNode | null>();
  // 左の一覧の幅（エディタ・履歴タブと同じ幅を覚える）
  const width = useDragSize({ setting: CHANGES_LIST_WIDTH, min: 200, keep: 320 });
  const [rootDrop, setRootDrop] = useState(false);

  const entries = list.data?.entries;
  const tree = useMemo(() => buildMemoTree(entries ?? []), [entries]);
  const found = useMemo(() => (query.trim() ? filterMemos(entries ?? [], query) : null), [entries, query]);
  const dir = list.data?.dir ?? "";

  const openFolders = (paths: string[]) => setOpenList([...new Set([...openList, ...paths])]);
  const select = (path: string) => {
    setSelected(path);
    openFolders(ancestorsOf(path));
  };

  // URL で来たメモを開いて、URL から外す（チャットの「メモに追加」のあと）
  useEffect(() => {
    if (!openMemo) return;
    select(openMemo);
    memosStore.invalidate(projectId);
    navigate({ name: "project", id: projectId, tab: "memos" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMemo]);

  const actions = useMemoActions(projectId, {
    onCreated: (path, isDir) => (isDir ? openFolders([...ancestorsOf(path), path]) : select(path)),
    onMoved: (from, to) => {
      if (selected) setSelected(remapPath(selected, from, to));
      setOpenList([...new Set([...remapPaths(openList, from, to), ...ancestorsOf(to)])]);
    },
    onTrashed: (path) => {
      if (selected && isUnder(selected, path)) setSelected("");
      setOpenList(openList.filter((p) => !isUnder(p, path)));
    },
  });

  // 開いていたメモがもうない（Finder で消した・名前を変えた）なら、右は案内に戻す
  const selectedExists = Boolean(selected && entries?.some((e) => e.path === selected && !e.dir));
  const toggle = (path: string) => setOpenList(open.has(path) ? openList.filter((p) => p !== path) : [...openList, path]);
  const folderForNew = (node: TreeNode | null) => (node ? (node.dir ? node.path : parentOf(node.path)) : selected ? parentOf(selected) : "");
  const reveal = (path: string) => window.kickoff?.externalApps.revealPath(path ? `${dir}/${path}` : dir);

  return (
    <div className={cx("changes", "memo-tab", width.resizing && "resizing")}>
      <aside
        ref={width.paneRef}
        className={cx("changes-list", "memo-list", rootDrop && "drop-target")}
        style={{ width: width.size }}
        aria-label="メモ"
        onContextMenu={(e) => menu.open(e, null)}
        // 一覧の空いている所へ落とすと、いちばん上（直下）へ動かす
        onDragOver={(e) => {
          if (!isMemoDrag(e)) return;
          e.preventDefault();
          setRootDrop(true);
        }}
        onDragLeave={() => setRootDrop(false)}
        onDrop={(e) => {
          setRootDrop(false);
          const path = e.dataTransfer.getData(MEMO_DRAG_TYPE);
          if (path) void actions.moveInto(path, "");
        }}
      >
        <header className="changes-head">
          <span className="changes-branch" title={dir}>
            メモ
          </span>
          <span className="spacer" />
          <IconButton icon={FilePlus} label="新しいメモ" onClick={() => void actions.createMemo(folderForNew(null))} />
          <IconButton icon={FolderPlus} label="新しいフォルダ" onClick={() => void actions.createFolder(folderForNew(null))} />
          <RefreshButton label="メモの一覧を取り直す" busy={list.loading} onClick={() => memosStore.invalidate(projectId)} />
          <IconButton icon={ChevronsDownUp} label="フォルダをすべて閉じる" disabled={openList.length === 0} onClick={() => setOpenList([])} />
        </header>
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
                  <button role="option" aria-selected={selected === e.path} className={cx("tree-row", selected === e.path && "selected")} onClick={() => select(e.path)}>
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
            onSelect={select}
            onMenu={(e, node) => menu.open(e, node)}
            onDropInto={(path, folder) => void actions.moveInto(path, folder)}
          />
        )}
        {list.data?.truncated && <p className="muted small changes-empty">メモが多いため、途中までを表示しています。</p>}
      </aside>
      <div className="pane-resizer" aria-label="一覧の幅を変える" {...width.handle} />
      <div className="changes-diff memo-main">
        {selected && selectedExists ? (
          <MemoView key={selected} projectId={projectId} path={selected} dir={dir} />
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
                  {window.kickoff && list.data.exists && (
                    <button className="btn" onClick={() => void reveal("")}>
                      <FolderOpen size={14} aria-hidden /> Finder で開く
                    </button>
                  )}
                </>
              }
            >
              <p>このプロジェクトのメモは、プロジェクトの外のフォルダに Markdown で保存します。チャットの文を右クリックして「メモに追加」でも作れます（AI に要約させることもできます）。</p>
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
              <MenuItem onSelect={() => void actions.createFolder(folderForNew(menu.menu?.value ?? null))}>新しいフォルダ</MenuItem>
            </>
          )}
          {menu.menu.value && (
            <MenuItem onSelect={() => menu.menu?.value && void actions.rename(menu.menu.value.path, menu.menu.value.dir)}>名前を変更…</MenuItem>
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
    </div>
  );
}
