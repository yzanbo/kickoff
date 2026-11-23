import { Columns3, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { DbConnection, DbObjectPath } from "@shared/database/types";
import { useQuery } from "@/foundation/ui/query";
import { dbApi, dbAt } from "@/features/database/ui/api";
import { useRovingList } from "@/foundation/ui/kit/list/useRovingList";
import { PaletteDialog, usePaletteDialog } from "@/foundation/ui/kit/floating/PaletteDialog";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import type { DbClientTab } from "@/features/database/ui/state/dbClientTabs";
import { storage } from "@/features/database/ui/storage";
import { useDbConnectedIds } from "@/features/database/ui/state/connectionsStore";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import { treeKey } from "@/features/database/ui/tree/treeKeys";
import { findDbItems, openTreePaths, type DbFindItem, type DbFindSource } from "./dbFind";
import { objectPathLabel } from "@/features/database/ui/dbFormat";
import { TabObjectIcon } from "@/features/database/ui/tree/DbTreeObjects";

/** 一度に読む場所の数の上限（開いている木の段が多くても、読みに行くのはここまで） */
const MAX_PLACES = 10;

/**
 * ⌘⇧O「テーブル・列を探す」: いまつないでいる接続・木で開いている接続（と、開いているタブの接続）の、木で開いている場所
 * （なければ既定の DB・スキーマ）のテーブル・ビューと列の名前から探す。つないでいない接続には、探すためにつながない。
 * ↑↓・Enter で選び、テーブルのタブで開く（列で当たったときもそのテーブル）
 */
export function DbFindPalette({ connections, activeTab, onClose }: { connections: DbConnection[]; activeTab: DbClientTab | null; onClose: () => void }) {
  const client = useDbClient();
  const modal = usePaletteDialog();
  const [treeOpen] = useSetting(storage.settings.treeOpen(client.surfaceKey));
  const connected = useDbConnectedIds(client.projectId).data;
  const [query, setQuery] = useState("");
  const byId = new Map(connections.map((c) => [c.id, c]));

  // 開いたときに 1 回だけ読む（開いたときの接続・木の開き方で。あとで変わっても読み直さない）
  const loadSources = async (): Promise<{ sources: DbFindSource[]; failed: number }> => {
    const targets = connections.filter((c) => treeOpen.includes(treeKey.connection(c.id)) || connected?.includes(c.id) || activeTab?.connection_id === c.id);
    const places: { c: DbConnection; path: DbObjectPath }[] = [];
    let failed = 0;
    for (const c of targets) {
      const paths = openTreePaths(treeOpen, c.id, c.engine);
      if (activeTab && activeTab.connection_id === c.id && (activeTab.kind === "table" || activeTab.kind === "er")) paths.unshift(activeTab.path);
      if (paths.length === 0) {
        // 木で場所を開いていなければ既定の DB（PostgreSQL は public のスキーマ）
        const dbs = await dbApi("GET /api/projects/:projectId/db-connections/:connectionId/databases", dbAt(client.projectId, c.id, client.worktreeOf(c.id))).catch(() => null);
        if (dbs) paths.push({ database: dbs.current ?? dbs.databases[0] ?? null, schema: dbs.has_schemas ? "public" : null });
        else failed += 1;
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
          const [objects, outline] = await Promise.all([dbApi("POST /api/projects/:projectId/db-connections/:connectionId/objects", { ...dbAt(client.projectId, c.id, worktree), body: { path } }), dbApi("POST /api/projects/:projectId/db-connections/:connectionId/outline", { ...dbAt(client.projectId, c.id, worktree), body: { path } })]);
          return { connection_id: c.id, path, objects, columns: new Map(outline.map((t) => [t.name, t.columns])) };
        } catch {
          failed += 1;
          return null;
        }
      }),
    );
    return { sources: sources.filter((s): s is DbFindSource => s !== null), failed };
  };
  const loaded = useQuery(["DbFindPalette.sources", client.surfaceKey], loadSources).data ?? null;

  const items = findDbItems(loaded?.sources ?? [], query);
  const go = (item: DbFindItem | undefined) => {
    const c = item && byId.get(item.connection_id);
    if (!item || !c) return;
    modal.close();
    client.openTable(c, item.path, item.table, item.kind);
  };
  const nav = useRovingList({ mode: "activeDescendant", keys: items, onPick: go });
  useEffect(() => nav.setIndex(0), [query, loaded]);
  // 接続の名前・場所は、探す元に 2 つ以上あるときだけ添える
  const manyConnections = new Set(loaded?.sources.map((s) => s.connection_id)).size > 1;
  const manyPlaces = (loaded?.sources.length ?? 0) > 1;

  return (
    <PaletteDialog
      modal={modal}
      nav={nav}
      label="テーブル・列を探す"
      icon={<Search size={16} className="muted" aria-hidden />}
      input={{ value: query, onChange: setQuery, placeholder: "テーブル・列の名前（「表.列」で列を絞る）", label: "テーブル・列の名前" }}
      footer={loaded && loaded.failed > 0 && loaded.sources.length > 0 && <p className="db-find-note small muted">{loaded.failed} か所は読めませんでした</p>}
      onClose={onClose}
    >
      {!loaded ? (
        <li className="palette-empty">読み込み中…</li>
      ) : loaded.sources.length === 0 ? (
        <li className="palette-empty">{loaded.failed > 0 ? "読めませんでした（木で接続を開き直してください）" : "つないでいる接続がありません（左の木で接続を開くと探せます）"}</li>
      ) : (
        items.length === 0 && <li className="palette-empty">見つかりません</li>
      )}
      {items.map((item, i) => (
        <li key={item.key} role="option" {...nav.optionProps(i)}>
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
    </PaletteDialog>
  );
}
