import { PanelLeftOpen } from "lucide-react";
import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { DbConnection, DbImportCandidate } from "@shared/database/types";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { cx } from "@/foundation/ui/lib/cx";
import { hasAppModifier } from "@/foundation/ui/lib/keys";
import { closeConnectionTabs, closeDbTab, openErTab, openNoteTab, openNewSqlTab, openPreviewTab, openTableTab, pinDbTab, renameNoteTab, setSqlConnection, setTableFilter, tableTabKey, updateErTab, type DbClientTab } from "@/features/database/ui/state/dbClientTabs";
import { storage } from "@/features/database/ui/storage";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { useDbConnections } from "@/features/database/ui/state/connectionsStore";
import { SideNote } from "@/features/notes/ui/SideNote";
import { PopOutTabButton } from "@/features/panel/ui/tabs/PopOutTabButton";
import { CloseButton, IconButton } from "@/foundation/ui/kit/IconButton";
import { confirm } from "@/foundation/ui/kit/ask";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { ConnectionDialog } from "@/features/database/ui/connection/ConnectionDialog";
import { ConnectionMenu } from "@/features/database/ui/connection/ConnectionMenu";
import { CopyConnectionDialog } from "@/features/database/ui/connection/CopyConnectionDialog";
import { ImportConnectionDialog } from "@/features/database/ui/connection/ImportConnectionDialog";
import { DbClientContext, type DbClientActions, type DbFailure, type DbPrepTarget } from "@/features/database/ui/state/dbClientContext";
import { DbFailureDialog } from "@/features/database/ui/connection/DbFailureDialog";
import { DbFindPalette } from "./DbFindPalette";
import { DbHome } from "./DbHome";
import { DbList } from "./DbList";
import { DbPrepDialog } from "@/features/database/ui/connection/DbPrepDialog";
import { dbSurfaceKey, type DbSurface } from "@/features/database/ui/state/surface";
import { useDbClientTabs } from "@/features/database/ui/state/useDbClientTabs";
import { useDbClientRequests } from "@/features/database/ui/state/dbClientRequests";
import { createConnectionNote } from "@/features/database/ui/connection/dbNote";
import { breadcrumbOf, DbTabIcon, PendingMark, tabLabel, tabTitle, UnsavedMark } from "./DbTabParts";
import { DefinitionView } from "@/features/database/ui/table/DefinitionView";
import { finishSession } from "@/features/database/ui/state/sqlSessions";
import { SqlView } from "@/features/database/ui/sql/SqlView";
import { unsavedKey, unsavedTables } from "@/features/database/ui/state/tabFlags";
import { TableView } from "@/features/database/ui/table/TableView";

/** ER 図（@xyflow/react と elkjs は ER 図を開いたときだけ読む） */
const ErView = lazy(() => import("@/features/database/ui/er/ErView"));

/** 左の一覧を自動で隠す幅（これより狭い所では一覧を重ねて出し、右にパンくず。テーブルの表示の切り替えはアイコンだけ・行の詳細は下に重ねる） */
const NARROW_WIDTH = 720;

/**
 * DB クライアント（左に接続の一覧と木、右にタブ（テーブル・SQL））。プロジェクトの「DB」タブ・チャットの右の欄・別ウィンドウで同じものを使い、
 * 開いているタブと木の開き具合は置き場所（surface）ごとに覚える。worktree: SQLite のファイルを開く作業場所（null なら本体）。狭い所では左の一覧を隠し（左上のボタンで重ねて出す）、タブの上にパンくずを出す
 */
export function DatabaseClient({ projectId, surface, worktree }: { projectId: number; surface: DbSurface; worktree: string | null }) {
  const surfaceKey = dbSurfaceKey(surface);
  const connections = useDbConnections(projectId);
  const list = connections.data ?? [];
  const byId = useMemo(() => new Map(list.map((c) => [c.id, c])), [list]);
  const { state, update } = useDbClientTabs(surfaceKey);
  const [hidden, setHidden] = useSetting(storage.settings.listHidden);
  const [treeOpen, setTreeOpen] = useSetting(storage.settings.treeOpen(surfaceKey));
  const [editing, setEditing] = useState<DbConnection | null | undefined>(undefined);
  const [copying, setCopying] = useState(false);
  const [importing, setImporting] = useState<{ preselect: DbImportCandidate | null } | null>(null); // 取り込みの画面（Docker タブの「DB で開く」からは、その DB の案を選んだ形で）
  const [finding, setFinding] = useState(false);
  const [failure, setFailure] = useState<DbFailure | null>(null);
  const [prepFor, setPrepFor] = useState<DbPrepTarget | null>(null);
  const [mainOnly, setMainOnly] = useState<ReadonlySet<number>>(new Set());
  const menu = useContextMenu<DbConnection>();
  const width = useDragSize({ setting: storage.settings.listWidth, min: 180, keep: 320 });
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

  /** 接続を選ぶ（木で開いて一覧を出す） */
  const focusConnection = (connectionId: number) => {
    const key = `c:${connectionId}`;
    const open = readSetting(storage.settings.treeOpen(surfaceKey));
    if (!open.includes(key)) setTreeOpen([...open, key]);
    // 描いたばかり（預けた頼み）だと narrow がまだ測れていないので、その場で幅を測る
    if ((root.current?.clientWidth ?? Infinity) < NARROW_WIDTH) setOverlay(true);
    else setHidden(false);
  };

  // 右の欄の ▾ の「DB ▸」から: 接続を選ぶ・接続を足す。Docker タブの「DB で開く」から: 接続を選ぶ・案を選んで取り込みの画面を開く
  useDbClientRequests(surfaceKey, (r) => {
    if (r.kind === "add") return setEditing(null);
    if (r.kind === "import") return setImporting({ preselect: r.candidate });
    focusConnection(r.connectionId);
  });

  // 消した接続のタブは閉じる（一覧が届いてから。タブが変わっても見直さない）
  const closeGoneTabs = useEffectEvent(() => {
    const gone = state.tabs.filter((t) => !byId.has(t.connection_id)).map((t) => t.connection_id);
    if (gone.length > 0) update((s) => gone.reduce(closeConnectionTabs, s));
  });
  useEffect(() => {
    if (connections.data) closeGoneTabs();
  }, [connections.data]);

  const actions: DbClientActions = {
    projectId,
    surfaceKey,
    narrow,
    worktreeOf: (id) => (mainOnly.has(id) ? null : worktree),
    openMain: (id) => setMainOnly((s) => new Set([...s, id])),
    openTable: (c, path, name, object, filter, preview) => {
      const tab = { key: tableTabKey(c.id, path, name, object), kind: "table" as const, connection_id: c.id, path, name, object, ...(filter ? { filter } : {}) };
      // 仮のタブは、保存していない変更があれば置き換えずに残す
      update((s) => (preview ? openPreviewTab(s, tab, (key) => unsavedTables.has(unsavedKey(surfaceKey, key))) : openTableTab(s, tab)));
      setOverlay(false);
    },
    openSql: (c, sql) => {
      update((s) => {
        const next = openNewSqlTab(s, c.id); // SQL のタブは開いたときに書きかけを読むので、タブを足す前に書いておく
        if (sql && next.active) writeSetting(storage.settings.sqlDraft(`${surfaceKey}:${next.active}`), sql);
        return next;
      });
      setOverlay(false);
    },
    switchSqlConnection: async (tabKey, c) => {
      const tab = state.tabs.find((t) => t.key === tabKey);
      const old = tab && byId.get(tab.connection_id);
      if (old && !(await finishSession(projectId, old, tabKey))) return;
      // 聞いている間にタブが変わっていてもよいよう、いまの値から替える
      update((s) => setSqlConnection(s, tabKey, c.id));
    },
    openEr: (c, path, focus) => {
      update((s) => openErTab(s, c.id, path, focus));
      setOverlay(false);
    },
    editConnection: (c) => setEditing(c),
    openNote: (c) => void openConnectionNote(c),
    showFailure: setFailure,
    showPrep: setPrepFor,
  };

  /** 接続の手順ノートをタブで開く（なければ作ってから。作るのをやめたら何もしない） */
  const openConnectionNote = async (c: DbConnection) => {
    const path = c.note_path ?? (await createConnectionNote(projectId, c));
    if (!path) return;
    // 作るダイアログの間にタブが変わっていてもよいよう、いまの値から開く
    update((s) => openNoteTab(s, c.id, path));
    setOverlay(false);
  };

  /** タブを閉じる（SQL のタブはコミットしていなければ聞き（やめたら閉じない）、DB の接続を閉じて書きかけの SQL を消す。テーブルのタブは保存していない変更があれば捨てるか聞く） */
  const closeTab = async (tab: DbClientTab) => {
    if (tab.kind === "table" && unsavedTables.has(unsavedKey(surfaceKey, tab.key))) {
      const ok = await confirm({ title: "保存していない変更があります", message: `「${tab.name}」の変更を保存せずに閉じますか？変更は捨てます。`, confirmLabel: "捨てて閉じる", danger: true });
      if (!ok) return;
    }
    if (tab.kind === "sql") {
      const c = byId.get(tab.connection_id);
      if (c) {
        const ok = await finishSession(projectId, c, tab.key);
        if (!ok) return;
      }
      writeSetting(storage.settings.sqlDraft(`${surfaceKey}:${tab.key}`), "");
    }
    update((s) => closeDbTab(s, tab.key));
  };

  const active = state.tabs.find((t) => t.key === state.active) ?? null;
  /** タブにいくつもの接続が混ざるとき、タブの名前の前に接続の名前を添える */
  const mixedConnections = new Set(state.tabs.map((t) => t.connection_id)).size > 1;
  const listShown = narrow ? overlay : !hidden;

  return (
    <DbClientContext.Provider value={actions}>
      <div
        ref={root}
        className={cx("db-client tool-frame", narrow && "narrow")}
        // ⌘⇧O: テーブル・列を探す（ピントがこの DB クライアントの中にあるとき）
        onKeyDown={(e) => {
          if (hasAppModifier(e) && e.shiftKey && !e.altKey && e.code === "KeyO" && list.length > 0) {
            e.preventDefault();
            setFinding(true);
          }
        }}
      >
        {listShown && (
          <DbList
            projectId={projectId}
            connections={list}
            loaded={Boolean(connections.data)}
            error={connections.error}
            narrow={narrow}
            width={width}
            onAdd={() => setEditing(null)}
            onImport={() => setImporting({ preselect: null })}
            onCopy={() => setCopying(true)}
            onFind={() => setFinding(true)}
            onHide={() => (narrow ? setOverlay(false) : setHidden(true))}
            onConnectionMenu={(e, c) => menu.open(e, c)}
          />
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
                    onClick={() => update((s) => ({ ...s, active: t.key }))}
                    onDoubleClick={() => update((s) => pinDbTab(s, t.key))}
                  >
                    <span className="db-env-dot" aria-hidden />
                    <DbTabIcon tab={t} />
                    {mixedConnections && c && <span className="db-tab-conn">{c.name}</span>}
                    <span className="db-tab-label">{tabLabel(t)}</span>
                    {t.kind === "sql" && <PendingMark tabKey={t.key} />}
                    {t.kind === "table" && <UnsavedMark flagKey={unsavedKey(surfaceKey, t.key)} />}
                  </button>
                  <CloseButton size="xs" label="タブを閉じる" iconSize={12} className="db-tab-close" onClick={() => void closeTab(t)} />
                </div>
              );
            })}
            {/* 右の欄では「別ウィンドウで開く」（ほかのタブの中身と同じく右端） */}
            <span className="db-tabs-end">
              <PopOutTabButton />
            </span>
          </div>
          {active && narrow && (
            <button type="button" className="db-breadcrumb small" title="接続の一覧を重ねて出す" onClick={() => setOverlay(true)}>
              {breadcrumbOf(active, byId.get(active.connection_id))}
            </button>
          )}
          {/* 広い幅でも、テーブル・関数・列挙型のタブの上には接続から数えたパンくず（どの接続のどの DB か取り違えないように。一覧は横に見えているので押せない） */}
          {active && !narrow && active.kind === "table" && <div className="db-breadcrumb static small">{breadcrumbOf(active, byId.get(active.connection_id))}</div>}
          <div className="db-tab-body">
            {state.tabs.map((t) => {
              const c = byId.get(t.connection_id);
              if (!c) return null;
              return (
                <div key={t.key} className="db-tab-page" hidden={t.key !== state.active}>
                  {t.kind === "note" ? (
                    <SideNote
                      projectId={projectId}
                      path={t.path}
                      chatId={null}
                      noteTabButton
                      // 接続の note_path はコアが付け替えて知らせる
                      onRenamed={(to) => update((s) => renameNoteTab(s, t.key, to))}
                    />
                  ) : t.kind === "sql" ? (
                    <SqlView tab={t} connection={c} active={t.key === state.active} />
                  ) : t.kind === "er" ? (
                    <Suspense fallback={<p className="db-er-loading small muted">読み込み中…</p>}>
                      <ErView tab={t} connection={c} active={t.key === state.active} onChange={(patch) => update((s) => updateErTab(s, t.key, patch))} />
                    </Suspense>
                  ) : t.object === "function" || t.object === "enum" ? (
                    <DefinitionView tab={{ ...t, object: t.object }} connection={c} />
                  ) : (
                    <TableView tab={t} connection={c} active={t.key === state.active} onFilter={(filter) => update((s) => setTableFilter(s, t.key, filter))} />
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
        {finding && <DbFindPalette connections={list} activeTab={active} onClose={() => setFinding(false)} />}
        {importing && <ImportConnectionDialog projectId={projectId} preselect={importing.preselect} onImported={(c) => focusConnection(c.id)} onClose={() => setImporting(null)} />}
        {failure && (
          <DbFailureDialog
            projectId={projectId}
            // 一覧が取り直されたら（手順ノートを結んだなど）新しい方で
            connection={byId.get(failure.connection.id) ?? failure.connection}
            error={failure.error}
            onNote={() => void openConnectionNote(byId.get(failure.connection.id) ?? failure.connection)}
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
