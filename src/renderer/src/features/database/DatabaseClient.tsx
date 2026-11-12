import { Copy, FolderInput, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { DbConnection } from "@shared/types";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import { cx } from "@/lib/cx";
import {
  closeConnectionTabs,
  closeDbTab,
  openErTab,
  openMemoTab,
  openNewSqlTab,
  openPreviewTab,
  openTableTab,
  pinDbTab,
  renameMemoTab,
  setSqlConnection,
  setTableFilter,
  tableTabKey,
  updateErTab,
  type DbClientTab,
} from "@/lib/dbClientTabs";
import { DB_LIST_HIDDEN, DB_LIST_WIDTH, dbClientTabs, dbSqlDraft, dbTreeOpen } from "@/lib/storageKeys";
import { readSetting, writeSetting } from "@/lib/storage";
import { useDbConnections } from "@/stores/dbConnections";
import { SideMemo } from "@/features/memo/SideMemo";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { confirmDialog } from "@/ui/dialogs";
import { ErrorText } from "@/ui/ErrorText";
import { useContextMenu } from "@/ui/useContextMenu";
import { ConnectionDialog } from "./ConnectionDialog";
import { ConnectionMenu } from "./ConnectionMenu";
import { CopyConnectionDialog } from "./CopyConnectionDialog";
import { ImportConnectionDialog } from "./ImportConnectionDialog";
import { DbClientContext, type DbClientActions, type DbFailure, type DbPrepTarget } from "./dbClientContext";
import { DbFailureDialog } from "./DbFailureDialog";
import { DbHome } from "./DbHome";
import { DbPrepDialog } from "./DbPrepDialog";
import { createConnectionMemo } from "./dbMemo";
import { breadcrumbOf, DbTabIcon, PendingMark, tabLabel, tabTitle, UnsavedMark } from "./DbTabParts";
import { DbTree } from "./DbTree";
import { DefinitionView } from "./DefinitionView";
import { finishSession } from "./sqlSessions";
import { SqlView } from "./SqlView";
import { unsavedKey, unsavedTables } from "./tabFlags";
import { TableView } from "./TableView";

/** ER 図（@xyflow/react と elkjs は ER 図を開いたときだけ読む） */
const ErView = lazy(() => import("./er/ErView"));

/** 左の一覧を自動で隠す幅（これより狭い所では一覧を重ねて出し、右にパンくず） */
const NARROW_WIDTH = 560;

/**
 * DB クライアント（左に接続の一覧と木、右にタブ（テーブル・SQL））。プロジェクトの「DB」タブ・チャットの右の欄・別ウィンドウで同じものを使い、
 * 開いているタブと木の開き具合は place ごとに覚える。worktree: SQLite のファイルを開く作業場所（null なら本体）。
 * 狭い所では左の一覧を隠し（左上のボタンで重ねて出す）、タブの上にパンくずを出す
 */
export function DatabaseClient({ projectId, place, worktree }: { projectId: number; place: string; worktree: string | null }) {
  const connections = useDbConnections(projectId);
  const list = connections.data ?? [];
  const byId = useMemo(() => new Map(list.map((c) => [c.id, c])), [list]);
  const [state, setState] = useSetting(dbClientTabs(place));
  const [hidden, setHidden] = useSetting(DB_LIST_HIDDEN);
  const [treeOpen, setTreeOpen] = useSetting(dbTreeOpen(place));
  const [editing, setEditing] = useState<DbConnection | null | undefined>(undefined);
  const [copying, setCopying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const [prepFor, setPrepFor] = useState<DbPrepTarget | null>(null);
  const [mainOnly, setMainOnly] = useState<ReadonlySet<number>>(new Set());
  const menu = useContextMenu<DbConnection>();
  const width = useDragSize({ setting: DB_LIST_WIDTH, min: 180, keep: 320 });
  const root = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setNarrow(el.clientWidth < NARROW_WIDTH));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 消した接続のタブは閉じる（一覧が届いてから）
  useEffect(() => {
    if (!connections.data) return;
    const gone = state.tabs.filter((t) => !byId.has(t.connection_id)).map((t) => t.connection_id);
    if (gone.length > 0) setState(gone.reduce(closeConnectionTabs, state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections.data]);

  const actions: DbClientActions = {
    projectId,
    place,
    worktreeOf: (id) => (mainOnly.has(id) ? null : worktree),
    useMain: (id) => setMainOnly((s) => new Set([...s, id])),
    openTable: (c, path, name, object, filter, preview) => {
      const tab = { key: tableTabKey(c.id, path, name, object), kind: "table" as const, connection_id: c.id, path, name, object, ...(filter ? { filter } : {}) };
      // 仮のタブは、保存していない変更があれば置き換えずに残す
      setState(preview ? openPreviewTab(state, tab, (key) => unsavedTables.has(unsavedKey(place, key))) : openTableTab(state, tab));
      setOverlay(false);
    },
    openSql: (c, sql) => {
      const next = openNewSqlTab(state, c.id);
      // SQL のタブは開いたときに書きかけを読むので、先に書いておく
      if (sql && next.active) writeSetting(dbSqlDraft(`${place}:${next.active}`), sql);
      setState(next);
      setOverlay(false);
    },
    switchSqlConnection: async (tabKey, c) => {
      const tab = readSetting(dbClientTabs(place)).tabs.find((t) => t.key === tabKey);
      const old = tab && byId.get(tab.connection_id);
      if (old && !(await finishSession(projectId, old, tabKey))) return;
      // 聞いている間にタブが変わっていてもよいよう、いまの値から替える
      setState(setSqlConnection(readSetting(dbClientTabs(place)), tabKey, c.id));
    },
    openEr: (c, path, focus) => {
      setState(openErTab(state, c.id, path, focus));
      setOverlay(false);
    },
    editConnection: (c) => setEditing(c),
    openMemo: (c) => void openConnectionMemo(c),
    showFailure: setFailure,
    showPrep: setPrepFor,
  };

  /** 接続の手順メモをタブで開く（なければ作ってから。作るのをやめたら何もしない） */
  const openConnectionMemo = async (c: DbConnection) => {
    const path = c.memo_path ?? (await createConnectionMemo(projectId, c));
    if (!path) return;
    // 作るダイアログの間にタブが変わっていてもよいよう、いまの値から開く
    setState(openMemoTab(readSetting(dbClientTabs(place)), c.id, path));
    setOverlay(false);
  };

  /** タブを閉じる（SQL のタブはコミットしていなければ聞き（やめたら閉じない）、DB の接続を閉じて書きかけの SQL を消す。テーブルのタブは保存していない変更があれば捨てるか聞く） */
  const closeTab = async (tab: DbClientTab) => {
    if (tab.kind === "table" && unsavedTables.has(unsavedKey(place, tab.key))) {
      const ok = await confirmDialog({ title: "保存していない変更があります", message: `「${tab.name}」の変更を保存せずに閉じますか？変更は捨てます。`, confirmLabel: "捨てて閉じる", danger: true });
      if (!ok) return;
    }
    if (tab.kind === "sql") {
      const c = byId.get(tab.connection_id);
      if (c) {
        const ok = await finishSession(projectId, c, tab.key);
        if (!ok) return;
      }
      writeSetting(dbSqlDraft(`${place}:${tab.key}`), "");
    }
    setState(closeDbTab(state, tab.key));
  };

  const active = state.tabs.find((t) => t.key === state.active) ?? null;
  const listShown = narrow ? overlay : !hidden;

  return (
    <DbClientContext.Provider value={actions}>
      <div ref={root} className={cx("db-client", narrow && "narrow")}>
        {listShown && (
          <aside ref={width.paneRef} className={cx("db-list", narrow && "overlay")} style={narrow ? undefined : { width: width.size }}>
            <div className="db-list-head">
              <span className="db-list-title">接続</span>
              <IconButton icon={Plus} label="接続を追加" onClick={() => setEditing(null)} />
              <IconButton icon={FolderInput} label="プロジェクトから取り込む（.env・docker compose・Prisma・SQLite のファイル）" onClick={() => setImporting(true)} />
              <IconButton icon={Copy} label="ほかのプロジェクトの接続を写す" onClick={() => setCopying(true)} />
              <IconButton icon={PanelLeftClose} label="一覧を隠す" onClick={() => (narrow ? setOverlay(false) : setHidden(true))} />
            </div>
            <ErrorText message={connections.error} />
            {connections.data && list.length === 0 ? (
              <div className="db-list-empty small muted">
                <p>まだ接続がありません。</p>
                <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                  接続を追加
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setImporting(true)}>
                  プロジェクトから取り込む
                </button>
              </div>
            ) : (
              <DbTree connections={list} onConnectionMenu={(e, c) => menu.open(e, c)} />
            )}
            {!narrow && <div className="pane-resizer db-list-resizer" {...width.handle} />}
          </aside>
        )}
        <section className="db-main">
          <div className="db-tabs" role="tablist">
            {!listShown && <IconButton icon={PanelLeftOpen} label="接続の一覧を表示" onClick={() => (narrow ? setOverlay(true) : setHidden(false))} />}
            {state.tabs.map((t) => {
              const c = byId.get(t.connection_id);
              return (
                <div key={t.key} className={cx("db-tab", t.key === state.active && "active", t.kind === "table" && t.preview && "preview", c && `db-env-${c.environment}`)} role="tab" aria-selected={t.key === state.active}>
                  <button
                    type="button"
                    className="db-tab-name"
                    title={t.kind === "table" && t.preview ? `${tabTitle(t, c)}\n仮のタブ（ダブルクリックで固定）` : tabTitle(t, c)}
                    onClick={() => setState({ ...state, active: t.key })}
                    onDoubleClick={() => setState(pinDbTab(state, t.key))}
                  >
                    <span className="db-env-dot" aria-hidden />
                    <DbTabIcon tab={t} />
                    <span className="db-tab-label">{tabLabel(t)}</span>
                    {t.kind === "sql" && <PendingMark tabKey={t.key} />}
                    {t.kind === "table" && <UnsavedMark flagKey={unsavedKey(place, t.key)} />}
                  </button>
                  <CloseButton label="タブを閉じる" size={12} className="db-tab-close" onClick={() => void closeTab(t)} />
                </div>
              );
            })}
            {/* 右の欄では「別ウィンドウで開く」（ほかのタブの中身と同じく右端） */}
            <span className="db-tabs-end">
              <PopOutTabButton />
            </span>
          </div>
          {active && narrow && <div className="db-breadcrumb small">{breadcrumbOf(active, byId.get(active.connection_id))}</div>}
          <div className="db-tab-body">
            {state.tabs.map((t) => {
              const c = byId.get(t.connection_id);
              if (!c) return null;
              return (
                <div key={t.key} className="db-tab-page" hidden={t.key !== state.active}>
                  {t.kind === "memo" ? (
                    <SideMemo
                      projectId={projectId}
                      path={t.path}
                      chatId={null}
                      // 接続の memo_path はコアが付け替えて知らせる
                      onRenamed={(to) => setState(renameMemoTab(readSetting(dbClientTabs(place)), t.key, to))}
                    />
                  ) : t.kind === "sql" ? (
                    <SqlView tab={t} connection={c} active={t.key === state.active} />
                  ) : t.kind === "er" ? (
                    <Suspense fallback={<p className="db-er-loading small muted">読み込み中…</p>}>
                      <ErView tab={t} connection={c} active={t.key === state.active} onChange={(patch) => setState(updateErTab(state, t.key, patch))} />
                    </Suspense>
                  ) : t.object === "function" || t.object === "enum" ? (
                    <DefinitionView tab={{ ...t, object: t.object }} connection={c} />
                  ) : (
                    <TableView tab={t} connection={c} active={t.key === state.active} onFilter={(filter) => setState(setTableFilter(state, t.key, filter))} />
                  )}
                </div>
              );
            })}
            {!active && connections.data && (
              <DbHome
                projectId={projectId}
                connections={list}
                onOpen={(c) => {
                  // 左の木でその接続を開く（一覧を隠していれば出す）
                  const key = `c:${c.id}`;
                  if (!treeOpen.includes(key)) setTreeOpen([...treeOpen, key]);
                  if (narrow) setOverlay(true);
                  else setHidden(false);
                }}
                onMenu={(e, c) => menu.open(e, c)}
                onAdd={() => setEditing(null)}
              />
            )}
          </div>
        </section>
        {menu.menu && <ConnectionMenu at={menu.menu.at} connection={menu.menu.value} onClose={menu.close} />}
        {editing !== undefined && <ConnectionDialog projectId={projectId} connection={editing} worktree={worktree} onClose={() => setEditing(undefined)} />}
        {copying && <CopyConnectionDialog projectId={projectId} onClose={() => setCopying(false)} />}
        {importing && <ImportConnectionDialog projectId={projectId} onClose={() => setImporting(false)} />}
        {failure && (
          <DbFailureDialog
            projectId={projectId}
            // 一覧が取り直されたら（手順メモを結んだなど）新しい方で
            connection={byId.get(failure.connection.id) ?? failure.connection}
            error={failure.error}
            onMemo={() => void openConnectionMemo(byId.get(failure.connection.id) ?? failure.connection)}
            onRetry={failure.retry}
            onPrep={() => setPrepFor({ connection: failure.connection, retry: failure.retry })}
            onClose={() => setFailure(null)}
          />
        )}
        {prepFor && (
          <DbPrepDialog
            projectId={projectId}
            // 確かめたら一覧が取り直されるので、新しい方で
            connection={byId.get(prepFor.connection.id) ?? prepFor.connection}
            onRetry={prepFor.retry}
            onClose={() => setPrepFor(null)}
          />
        )}
      </div>
    </DbClientContext.Provider>
  );
}
