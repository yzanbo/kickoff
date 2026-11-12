import { Columns3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DbConnection, DbObjectPath } from "@shared/types";
import { api } from "@/api";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useSetting } from "@/hooks/useSetting";
import type { DbClientTab } from "@/lib/dbClientTabs";
import { dbTreeOpen } from "@/lib/storageKeys";
import { useDbConnectedIds } from "@/stores/dbConnections";
import { useDbClient } from "./dbClientContext";
import { findDbItems, openTreePaths, type DbFindItem, type DbFindSource } from "./dbFind";
import { objectPathLabel } from "./dbFormat";
import { TabObjectIcon } from "./DbTreeObjects";

/** 一度に読む場所の数の上限（開いている木の段が多くても、読みに行くのはここまで） */
const MAX_PLACES = 10;

/**
 * ⌘⇧O「テーブル・列を探す」: いまつないでいる接続・木で開いている接続（と、開いているタブの接続）の、木で開いている場所
 * （なければ既定の DB・スキーマ）のテーブル・ビューと列の名前から探す。つないでいない接続には、探すためにつながない。
 * ↑↓・Enter で選び、テーブルのタブで開く（列で当たったときもそのテーブル）
 */
export function DbFindPalette({ connections, activeTab, onClose }: { connections: DbConnection[]; activeTab: DbClientTab | null; onClose: () => void }) {
  const client = useDbClient();
  const dialog = useModalDialog();
  const [treeOpen] = useSetting(dbTreeOpen(client.place));
  const connected = useDbConnectedIds(client.projectId).data;
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<{ sources: DbFindSource[]; failed: number } | null>(null);
  const byId = useMemo(() => new Map(connections.map((c) => [c.id, c])), [connections]);

  // 開いたときに 1 回だけ読む
  useEffect(() => {
    let alive = true;
    const targets = connections.filter((c) => treeOpen.includes(`c:${c.id}`) || connected?.includes(c.id) || activeTab?.connection_id === c.id);
    void (async () => {
      const places: { c: DbConnection; path: DbObjectPath }[] = [];
      let failed = 0;
      for (const c of targets) {
        const paths = openTreePaths(treeOpen, c.id, c.engine);
        if (activeTab && activeTab.connection_id === c.id && (activeTab.kind === "table" || activeTab.kind === "er")) paths.unshift(activeTab.path);
        if (paths.length === 0) {
          // 木で場所を開いていなければ既定の DB（PostgreSQL は public のスキーマ）
          try {
            const dbs = await api.dbDatabases(client.projectId, c.id, client.worktreeOf(c.id));
            const database = dbs.current ?? dbs.databases[0] ?? null;
            paths.push({ database, schema: dbs.has_schemas ? "public" : null });
          } catch {
            failed += 1;
          }
        }
        const seen = new Set<string>();
        for (const path of paths) {
          const key = objectPathLabel(path);
          if (!seen.has(key)) places.push({ c, path });
          seen.add(key);
        }
      }
      const sources = await Promise.all(
        places.slice(0, MAX_PLACES).map(async ({ c, path }): Promise<DbFindSource | null> => {
          const worktree = client.worktreeOf(c.id);
          try {
            const [objects, outline] = await Promise.all([api.dbObjects(client.projectId, c.id, path, worktree), api.dbOutline(client.projectId, c.id, path, worktree)]);
            return { connection_id: c.id, path, objects, columns: new Map(outline.map((t) => [t.name, t.columns])) };
          } catch {
            failed += 1;
            return null;
          }
        }),
      );
      if (alive) setLoaded({ sources: sources.filter((s): s is DbFindSource => s !== null), failed });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => findDbItems(loaded?.sources ?? [], query), [loaded, query]);
  const go = (item: DbFindItem | undefined) => {
    const c = item && byId.get(item.connection_id);
    if (!item || !c) return;
    dialog.close();
    client.openTable(c, item.path, item.table, item.kind);
  };
  const nav = useListNavigation(items, go);
  useEffect(() => nav.setIndex(0), [query, loaded]);
  useEffect(() => {
    dialog.ref.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [nav.index, dialog.ref]);
  // 接続の名前・場所は、探す元に 2 つ以上あるときだけ添える
  const manyConnections = new Set(loaded?.sources.map((s) => s.connection_id)).size > 1;
  const manyPlaces = (loaded?.sources.length ?? 0) > 1;

  return (
    <dialog ref={dialog.ref} className="palette" aria-label="テーブル・列を探す" onClose={onClose} {...dialog.backdropProps}>
      <div className="palette-input">
        <Search size={16} className="muted" aria-hidden />
        <input autoFocus value={query} placeholder="テーブル・列の名前（「表.列」で列を絞る）" aria-label="テーブル・列の名前" onChange={(e) => setQuery(e.target.value)} onKeyDown={nav.onKeyDown} />
      </div>
      <ul className="palette-list" role="listbox">
        {!loaded ? (
          <li className="palette-empty">読み込み中…</li>
        ) : loaded.sources.length === 0 ? (
          <li className="palette-empty">{loaded.failed > 0 ? "読めませんでした（木で接続を開き直してください）" : "つないでいる接続がありません（左の木で接続を開くと探せます）"}</li>
        ) : (
          items.length === 0 && <li className="palette-empty">見つかりません</li>
        )}
        {items.map((item, i) => (
          <li key={item.key} role="option" aria-selected={i === nav.index}>
            <button type="button" className={`palette-item ${i === nav.index ? "active" : ""}`} onMouseEnter={() => nav.setIndex(i)} onClick={() => go(item)}>
              {item.column ? <Columns3 size={13} className="muted" aria-hidden /> : <TabObjectIcon object={item.kind} />}
              <span className="palette-label">
                {item.column ? (
                  <>
                    <span className="muted">{item.table}.</span>
                    {item.column}
                  </>
                ) : (
                  item.table
                )}
              </span>
              <span className="palette-hint">
                <span className="palette-hint-text">{[manyConnections ? byId.get(item.connection_id)?.name : null, manyPlaces ? objectPathLabel(item.path) : null].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {loaded && loaded.failed > 0 && loaded.sources.length > 0 && <p className="db-find-note small muted">{loaded.failed} か所は読めませんでした</p>}
    </dialog>
  );
}
