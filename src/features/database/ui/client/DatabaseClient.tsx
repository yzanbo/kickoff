import "./DatabaseClient.css";
import { PanelLeftOpen } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import type { DbConnection } from "@shared/database/types";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useNarrowerThan } from "@/foundation/ui/hooks/useNarrowerThan";
import { cx } from "@/foundation/ui/lib/cx";
import { hasAppModifier } from "@/foundation/ui/lib/keys";
import { closeTab, keepTab } from "@/features/database/ui/tabList";
import { useTabs } from "@/foundation/ui/kit/tabs/useTabs";
import { closeConnectionTabs, openErTab, openNoteTab, openNewSqlTab, openPreviewTab, openTableTab, setSqlConnection, tableTabKey, type DbClientTab } from "@/features/database/ui/dbClientTabs";
import { storage } from "@/features/database/ui/storage";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { useDbConnections } from "@/features/database/ui/state/connectionsStore";
import { SideNote } from "@/features/notes/ui";
import { PopOutTabButton } from "@/features/panel/ui";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { ConnectionMenu } from "@/features/database/ui/connection/ConnectionMenu";
import { DbClientContext, type DbClientActions } from "@/features/database/ui/state/dbClientContext";
import { DbClientDialogs, type DbDialog } from "./DbClientDialogs";
import { DbHome } from "./DbHome";
import { DbList } from "./DbList";
import { DbTabPages } from "./DbTabPage";
import { canCloseDbTab } from "./dbTabClose";
import { dbSurfaceKey, type DbSurface } from "@/features/database/ui/state/surface";
import { useUnsavedSurface } from "@/foundation/ui/document/unsaved";
import { treeKey } from "@/features/database/ui/tree/treeKeys";
import { useDbClientTabs } from "@/features/database/ui/state/useDbClientTabs";
import { useDbClientRequests } from "@/features/database/ui/state/dbClientRequests";
import { createConnectionNote } from "@/features/database/ui/connection/dbNote";
import { DbBreadcrumb, DbTabStrip } from "./DbTabParts";
import { finishSession } from "@/features/database/ui/state/sqlSessions";
import { unsavedKey, unsavedTables } from "@/features/database/ui/state/tabFlags";

/** 左の一覧を自動で隠す幅（これより狭い所では一覧を重ねて出し、右にパンくず。テーブルの表示の切り替えはアイコンだけ・行の詳細は下に重ねる） */
const NARROW_WIDTH = 720;

/**
 * DB クライアント（左に接続の一覧と木、右にタブ（テーブル・SQL））。プロジェクトの「DB」タブ・チャットの右の欄・別ウィンドウで同じものを使い、
 * 開いているタブと木の開き具合は置き場所（surface）ごとに覚える。worktree: SQLite のファイルを開く作業場所（null なら本体）。狭い所では左の一覧を隠し（左上のボタンで重ねて出す）、タブの上にパンくずを出す。
 * 表の変更は、入れ物が渡す未保存の登録簿の置き場所の名前（UnsavedSurfaceContext。なければ置き場所ごとの名前）で出す（入れ物が離れる前に聞く）
 */
export function DatabaseClient({ projectId, surface, worktree }: { projectId: number; surface: DbSurface; worktree: string | null }) {
  const surfaceKey = dbSurfaceKey(surface);
  const unsavedSurface = useUnsavedSurface(`database:${surfaceKey}`);
  const connections = useDbConnections(projectId);
  const list = connections.data ?? [];
  const byId = new Map(list.map((c) => [c.id, c]));
  const { state, update } = useDbClientTabs(surfaceKey);
  const [hidden, setHidden] = useSetting(storage.settings.listHidden);
  const [dialog, setDialog] = useState<DbDialog | null>(null);
  const [mainOnly, setMainOnly] = useState<ReadonlySet<number>>(new Set());
  const menu = useContextMenu<DbConnection>();
  const width = useDragSize({ setting: storage.settings.listWidth, min: 180, keep: 320 });
  const { ref: root, narrow } = useNarrowerThan<HTMLDivElement>(NARROW_WIDTH);
  const [overlay, setOverlay] = useState(false);
  const tabs = useTabs({ keys: state.tabs.map((t) => t.key), value: state.active, onChange: (key) => update((s) => ({ ...s, active: key })), label: "DB のタブ" });

  /** 接続を選ぶ（木で開いて一覧を出す） */
  const focusConnection = (connectionId: number) => {
    const open = readSetting(storage.settings.treeOpen(surfaceKey));
    if (!open.includes(treeKey.connection(connectionId))) writeSetting(storage.settings.treeOpen(surfaceKey), [...open, treeKey.connection(connectionId)]);
    // 描いたばかり（預けた頼み）だと narrow がまだ測れていないので、その場で幅を測る
    if ((root.current?.clientWidth ?? Infinity) < NARROW_WIDTH) setOverlay(true);
    else setHidden(false);
  };

  // 右の欄の ▾ の「DB ▸」から: 接続を選ぶ・接続を足す。Docker タブの「DB で開く」から: 接続を選ぶ・案を選んで取り込みの画面を開く
  useDbClientRequests(surfaceKey, (r) => {
    if (r.kind === "add") return setDialog({ kind: "edit", connection: null });
    if (r.kind === "import") return setDialog({ kind: "import", preselect: r.candidate });
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
    unsavedSurface,
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
    editConnection: (connection) => setDialog({ kind: "edit", connection }),
    openNote: (c) => void openConnectionNote(c),
    showFailure: (failure) => setDialog({ kind: "failure", failure }),
    showPrep: (target) => setDialog({ kind: "prep", target }),
  };

  /** 接続の手順ノートをタブで開く（なければ作ってから。作るのをやめたら何もしない） */
  const openConnectionNote = async (c: DbConnection) => {
    const path = c.note_path ?? (await createConnectionNote(projectId, c));
    if (!path) return;
    // 作るダイアログの間にタブが変わっていてもよいよう、いまの値から開く
    update((s) => openNoteTab(s, c.id, path));
    setOverlay(false);
  };

  /** タブを閉じる（閉じる前の確かめは種類ごと。やめたら閉じない） */
  const closeDbTab = async (tab: DbClientTab) => {
    if (await canCloseDbTab({ projectId, surfaceKey, connection: byId.get(tab.connection_id) }, tab)) update((s) => closeTab(s, tab.key));
  };

  const active = state.tabs.find((t) => t.key === state.active) ?? null;
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
            setDialog({ kind: "find" });
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
            onAdd={() => setDialog({ kind: "edit", connection: null })}
            onImport={() => setDialog({ kind: "import", preselect: null })}
            onCopy={() => setDialog({ kind: "copy" })}
            onFind={() => setDialog({ kind: "find" })}
            onHide={() => (narrow ? setOverlay(false) : setHidden(true))}
            onConnectionMenu={(e, c) => menu.open(e, c)}
          />
        )}
        <section className="db-main">
          <DbTabStrip
            tabs={tabs}
            state={state}
            connectionOf={(id) => byId.get(id)}
            surfaceKey={surfaceKey}
            start={!listShown && <IconButton icon={PanelLeftOpen} label="接続の一覧を表示" onClick={() => (narrow ? setOverlay(true) : setHidden(false))} />}
            // 右の欄では「別ウィンドウで開く」（ほかのタブの中身と同じく右端）
            end={<PopOutTabButton />}
            onPin={(key) => update((s) => keepTab(s, key))}
            onClose={(t) => void closeDbTab(t)}
          />
          {active && <DbBreadcrumb tab={active} connection={byId.get(active.connection_id)} narrow={narrow} onOverlay={() => setOverlay(true)} />}
          <div className="db-tab-body">
            <DbTabPages tabs={tabs} state={state} connectionOf={(id) => byId.get(id)} update={update} note={(path, onRenamed) => <SideNote projectId={projectId} path={path} chatId={null} noteTabButton onRenamed={onRenamed} />} />
            {!active && connections.data && (
              <DbHome
                projectId={projectId}
                connections={list}
                onOpen={(c) => focusConnection(c.id)}
                onMenu={(e, c) => menu.open(e, c)}
                onAdd={() => setDialog({ kind: "edit", connection: null })}
              />
            )}
          </div>
        </section>
        {menu.menu && <ConnectionMenu at={menu.menu.at} connection={menu.menu.value} onClose={menu.close} />}
        <DbClientDialogs dialog={dialog} onChange={setDialog} projectId={projectId} worktree={worktree} connections={list} activeTab={active} onImported={(c) => focusConnection(c.id)} onNote={(c) => void openConnectionNote(c)} />
      </div>
    </DbClientContext.Provider>
  );
}
