import { Copy, Database, PanelLeftClose, PanelLeftOpen, Pencil, Plus, SquareTerminal, Table2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import { cx } from "@/lib/cx";
import { closeConnectionTabs, closeDbTab, openDbTab, openNewSqlTab, tableTabKey, type DbClientTab } from "@/lib/dbClientTabs";
import { DB_LIST_HIDDEN, DB_LIST_WIDTH, dbClientTabs, dbSqlDraft } from "@/lib/storageKeys";
import { writeSetting } from "@/lib/storage";
import { dbConnectionsStore, useDbConnections } from "@/stores/dbConnections";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";
import { alertDialog, choiceDialog, confirmDialog } from "@/ui/dialogs";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { ConnectionDialog } from "./ConnectionDialog";
import { CopyConnectionDialog } from "./CopyConnectionDialog";
import { DbClientContext, type DbClientActions } from "./dbClientContext";
import { DbTree } from "./DbTree";
import { objectPathLabel } from "./dbFormat";
import { useSqlPending } from "./sqlSessions";
import { SqlView } from "./SqlView";
import { TableView } from "./TableView";

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
  const [editing, setEditing] = useState<DbConnection | null | undefined>(undefined);
  const [copying, setCopying] = useState(false);
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
    openTable: (c, path, name, object) => {
      setState(openDbTab(state, { key: tableTabKey(c.id, path, name), kind: "table", connection_id: c.id, path, name, object }));
      setOverlay(false);
    },
    openSql: (c) => {
      setState(openNewSqlTab(state, c.id));
      setOverlay(false);
    },
    editConnection: (c) => setEditing(c),
  };

  /** タブを閉じる（SQL のタブはコミットしていなければ聞き（やめたら閉じない）、DB の接続を閉じて書きかけの SQL を消す） */
  const closeTab = async (tab: DbClientTab) => {
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

  const removeConnection = async (c: DbConnection) => {
    const ok = await confirmDialog({
      title: `接続「${c.name}」を消しますか？`,
      message: "保存したパスワードも消えます。DB の中身には触りません。",
      confirmLabel: "消す",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteDbConnection(projectId, c.id);
      dbConnectionsStore.invalidate(projectId);
    } catch (e) {
      await alertDialog("接続を消せませんでした", errorMessage(e));
    }
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
                <div key={t.key} className={cx("db-tab", t.key === state.active && "active", c && `db-env-${c.environment}`)} role="tab" aria-selected={t.key === state.active}>
                  <button type="button" className="db-tab-name" title={tabTitle(t, c)} onClick={() => setState({ ...state, active: t.key })}>
                    <span className="db-env-dot" aria-hidden />
                    {t.kind === "sql" ? <SquareTerminal size={12} aria-hidden /> : <Table2 size={12} aria-hidden />}
                    <span className="db-tab-label">{t.kind === "sql" ? t.title : t.name}</span>
                    {t.kind === "sql" && <PendingMark tabKey={t.key} />}
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
                  {t.kind === "table" ? <TableView tab={t} connection={c} /> : <SqlView tab={t} connection={c} />}
                </div>
              );
            })}
            {!active && (
              <EmptyState icon={Database} title={list.length === 0 ? "DB の接続を登録しましょう" : "テーブルか SQL を開きましょう"}>
                {list.length === 0
                  ? "このプロジェクトの DB（SQLite・PostgreSQL・MySQL / MariaDB）を登録すると、テーブルを見たり SQL を流したりできます。"
                  : "左の木でテーブルを押すと中身が開きます。接続の右クリックの「SQL を開く」で SQL を流せます。"}
              </EmptyState>
            )}
          </div>
        </section>
        {menu.menu && (
          <PopupMenu at={menu.menu.at} label="接続のメニュー" onClose={menu.close}>
            <MenuItem onSelect={() => actions.openSql(menu.menu!.value)}>
              <SquareTerminal size={14} /> SQL を開く
            </MenuItem>
            <MenuItem onSelect={() => setEditing(menu.menu!.value)}>
              <Pencil size={14} /> 編集…
            </MenuItem>
            <MenuItem danger onSelect={() => void removeConnection(menu.menu!.value)}>
              <Trash2 size={14} /> 消す…
            </MenuItem>
          </PopupMenu>
        )}
        {editing !== undefined && <ConnectionDialog projectId={projectId} connection={editing} worktree={worktree} onClose={() => setEditing(undefined)} />}
        {copying && <CopyConnectionDialog projectId={projectId} onClose={() => setCopying(false)} />}
      </div>
    </DbClientContext.Provider>
  );
}

/** SQL のタブがトランザクションの途中なら、名前の後ろに「コミットしていない」印 */
function PendingMark({ tabKey }: { tabKey: string }) {
  const pending = useSqlPending(tabKey);
  return pending ? <span className="db-tab-pending" data-tip="コミットしていない変更があります" aria-label="コミットしていない変更があります" /> : null;
}

const tabTitle = (t: DbClientTab, c: DbConnection | undefined) =>
  [c ? `${c.name}（${DB_ENVIRONMENT_LABELS[c.environment]}）` : "", t.kind === "table" ? objectPathLabel(t.path, t.name) : t.title].filter(Boolean).join(" › ");

const breadcrumbOf = (t: DbClientTab, c: DbConnection | undefined) =>
  [c?.name, ...(t.kind === "table" ? [t.path.database, t.path.schema, t.name] : [t.title])].filter(Boolean).join(" › ");

/**
 * SQL のタブを閉じる・切る前に、コミットしていなければ「コミット / 取り消す」を聞いてから接続を閉じる（取り消すなら接続を閉じて捨てる）。
 * やめたら false（タブを閉じない）
 */
export async function finishSession(projectId: number, c: DbConnection, session: string): Promise<boolean> {
  const { in_transaction } = await api.dbSessionState(projectId, c.id, session).catch(() => ({ in_transaction: false }));
  if (in_transaction) {
    const choice = await choiceDialog({
      title: "コミットしていない変更があります",
      message: `「${c.name}」で流した変更をコミットしますか？「取り消す」を選ぶと、変更は捨てます。`,
      choices: [
        { value: "commit", label: "コミット", primary: true },
        { value: "rollback", label: "取り消す" },
      ],
    });
    // やめたら閉じない
    if (choice === null) return false;
    try {
      if (choice === "commit") await api.commitDbSession(projectId, c.id, session);
    } catch (e) {
      await alertDialog("コミットできませんでした", errorMessage(e));
      return false;
    }
  }
  await api.closeDbSession(projectId, c.id, session).catch(() => {});
  return true;
}
