// ER 図のタブの状態と操作: 構造と覚えた位置を読み、絞り込み（名前・まわりの段・表示の細かさ・推測の関係）を当て、足りない位置を自動で並べる
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { DB_ER_AUTO_MAX, DB_ER_MAX, type DbConnection, type DbErPositions, type DbTableDetail } from "@shared/database/types";
import { erNeighborhood, erScope, erRelations } from "./erDiagram";
import { errorMessage } from "@shared/foundation/errors";
import { dbApi, dbAt, dbOne } from "@/features/database/ui/api";
import type { DbErTab } from "@/features/database/ui/state/dbClientTabs";
import { useQuery } from "@/foundation/ui/query";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import { erAutoLayout, erColumnsOf, erNodeSize, type ErDetail } from "./erLayout";

export type ErTabPatch = Partial<Pick<DbErTab, "focus" | "depth" | "names">>;

/** まわりの段の数の「すべて」 */
export const ER_ALL_DEPTH = 99;

export function useErDiagram(tab: DbErTab, connection: DbConnection, onChange: (patch: ErTabPatch) => void) {
  const client = useDbClient();
  const worktree = client.worktreeOf(connection.id);
  const scope = erScope(tab.path);
  const [auto, setAuto] = useState<DbErPositions>({});
  const [detail, setDetail] = useState<ErDetail>("all");
  const [inferred, setInferred] = useState(true);
  const [query, setQuery] = useState("");
  const at = dbAt(client.projectId, connection.id, worktree);

  // 構造を読む（場所・描くテーブルは中身で比べ、タブの形が作り直されただけでは読み直さない。読み直す間・失敗しても前の図を出す）
  const namesKey = tab.names?.join("\n") ?? null;
  const er = useQuery(["useErDiagram.er", connection.id, tab.path.database, tab.path.schema, namesKey, worktree, connection.updated_at], () =>
    dbApi("POST /api/projects/:projectId/db-connections/:connectionId/er", { ...at, body: { path: tab.path, names: tab.names } }), { keepPrevious: true });
  const schema = er.data ?? null;
  // 覚えた位置（読めなければ覚えていないものとして並べる）
  const layout = useQuery(["useErDiagram.layout", connection.id, scope], () =>
    dbApi("GET /api/projects/:projectId/db-connections/:connectionId/er-layout", { ...dbOne(client.projectId, connection.id), query: { scope } }).catch((): DbErPositions => ({})), { keepPrevious: true });
  const saved = layout.data ?? null;

  // 多い DB で「この表のまわり」から開いたら、そのテーブルと直接つながるテーブルを選んで描く
  const tooMany = schema !== null && tab.names === null && schema.tables.length === 0 && schema.names.length > DB_ER_AUTO_MAX;
  const around = useQuery(["useErDiagram.around", connection.id, tab.path.database, tab.path.schema, tab.focus, worktree], () =>
    dbApi("POST /api/projects/:projectId/db-connections/:connectionId/table", { ...at, body: { path: tab.path, name: tab.focus ?? "" } }), { enabled: tooMany && !!tab.focus });
  const pickAround = useEffectEvent((d: DbTableDetail) => {
    if (!schema || !tab.focus) return;
    const near = [tab.focus, ...d.foreign_keys.map((f) => f.ref_table), ...d.referenced_by.filter((r) => r.schema === tab.path.schema || r.schema === null).map((r) => r.table)];
    onChange({ names: [...new Set(near)].filter((n) => schema.names.includes(n)).slice(0, DB_ER_MAX) });
  });
  useEffect(() => {
    if (around.data) pickAround(around.data);
  }, [around.data]);
  const failed = er.error ?? around.error;
  const error = failed ? errorMessage(failed) : null;

  const tables = useMemo(() => schema?.tables ?? [], [schema]);
  const relations = useMemo(() => erRelations(tables, { inferred }), [tables, inferred]);

  /** 見せるテーブル（名前の絞り込みと、まわりの段） */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const near = tab.focus && tables.some((t) => t.name === tab.focus) ? erNeighborhood(relations, tab.focus, tab.depth) : null;
    return tables.filter((t) => (!near || near.has(t.name)) && (!needle || t.name.toLowerCase().includes(needle)));
  }, [tables, relations, query, tab.focus, tab.depth]);
  const shownNames = useMemo(() => new Set(shown.map((t) => t.name)), [shown]);
  const shownRelations = useMemo(() => relations.filter((r) => shownNames.has(r.from) && shownNames.has(r.to)), [relations, shownNames]);

  /** 線をつなぐ列（テーブルごと。表示の細かさが keys でも出す） */
  const keyColumns = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (table: string, cols: string[]) => {
      const set = map.get(table) ?? new Set<string>();
      for (const c of cols) set.add(c);
      map.set(table, set);
    };
    for (const r of relations) {
      add(r.from, r.fromColumns);
      add(r.to, r.toColumns);
    }
    return map;
  }, [relations]);

  /** 箱の大きさ（並べる計算に渡す） */
  const sizes = useMemo(() => new Map(shown.map((t) => [t.name, erNodeSize(t, erColumnsOf(t, detail, keyColumns.get(t.name) ?? new Set()))])), [shown, detail, keyColumns]);

  // 覚えた位置も自動の位置もないテーブルがあれば、見せているものすべてを並べ直す（覚えた位置はそのまま使う）
  const layoutRun = useRef(0);
  const missing = saved !== null && shown.some((t) => !saved[t.name] && !auto[t.name]);
  // 並べ直すのは、見せるもの・関係が変わったときだけ（表示の細かさで箱の大きさが変わっても並べ直さない）
  const layoutMissing = useEffectEvent(() => {
    const run = ++layoutRun.current;
    void erAutoLayout(
      shown.map((t) => ({ id: t.name, ...sizes.get(t.name)! })),
      shownRelations,
    ).then((p) => {
      if (run === layoutRun.current) setAuto((a) => ({ ...a, ...p }));
    });
  });
  useEffect(() => {
    if (missing) layoutMissing();
  }, [missing, shown, shownRelations]);

  const positionOf = useCallback((name: string) => saved?.[name] ?? auto[name] ?? null, [saved, auto]);

  /** 動かしたあとの位置を覚える（見せているものすべての位置を書き、ほかの覚えた位置は残す） */
  const savePositions = (moved: DbErPositions) => {
    const next = { ...(saved ?? {}) };
    for (const t of shown) {
      const p = moved[t.name] ?? positionOf(t.name);
      if (p) next[t.name] = p;
    }
    layout.setData(next);
    void dbApi("PUT /api/projects/:projectId/db-connections/:connectionId/er-layout", { ...dbOne(client.projectId, connection.id), body: { scope, positions: next } }).catch(() => {});
  };

  /** 「自動で並べ直す」: 覚えた位置を消して並べ直す */
  const relayout = async () => {
    await dbApi("DELETE /api/projects/:projectId/db-connections/:connectionId/er-layout", { ...dbOne(client.projectId, connection.id), query: { scope } }).catch(() => {});
    setAuto({});
    layout.setData({});
  };

  return {
    schema,
    error,
    loading: er.loading,
    tooMany,
    tables,
    shown,
    shownRelations,
    keyColumns,
    sizes,
    positionOf,
    ready: saved !== null && shown.every((t) => positionOf(t.name) !== null),
    detail,
    setDetail,
    inferred,
    setInferred,
    query,
    setQuery,
    reload: () => void er.reload(),
    savePositions,
    relayout,
  };
}

export type ErDiagramState = ReturnType<typeof useErDiagram>;
