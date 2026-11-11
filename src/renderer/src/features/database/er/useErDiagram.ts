// ER 図のタブの状態と操作: 構造と覚えた位置を読み、絞り込み（名前・まわりの段・表示の細かさ・推測の関係）を当て、足りない位置を自動で並べる
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DB_ER_AUTO_MAX, DB_ER_MAX, type DbConnection, type DbErPositions, type DbErSchema } from "@shared/types";
import { erNeighborhood, erPlace, erRelations } from "@shared/database/erDiagram";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import type { DbErTab } from "@/lib/dbClientTabs";
import { useDbClient } from "@/features/database/dbClientContext";
import { erAutoLayout, erColumnsOf, erNodeSize, type ErDetail } from "./erLayout";

export type ErTabPatch = Partial<Pick<DbErTab, "focus" | "depth" | "names">>;

/** まわりの段の数の「すべて」 */
export const ER_ALL_DEPTH = 99;

export function useErDiagram(tab: DbErTab, connection: DbConnection, onChange: (patch: ErTabPatch) => void) {
  const client = useDbClient();
  const worktree = client.worktreeOf(connection.id);
  const place = erPlace(tab.path);
  const [schema, setSchema] = useState<DbErSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [saved, setSaved] = useState<DbErPositions | null>(null);
  const [auto, setAuto] = useState<DbErPositions>({});
  const [detail, setDetail] = useState<ErDetail>("all");
  const [inferred, setInferred] = useState(true);
  const [query, setQuery] = useState("");

  const namesKey = tab.names?.join("\n") ?? null;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.dbEr(client.projectId, connection.id, tab.path, tab.names, worktree).then(
      (s) => {
        if (!alive) return;
        setSchema(s);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (!alive) return;
        setError(errorMessage(e));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.projectId, connection.id, tab.path.database, tab.path.schema, namesKey, worktree, reload, connection.updated_at]);

  useEffect(() => {
    let alive = true;
    api.dbErLayout(client.projectId, connection.id, place).then(
      (p) => alive && setSaved(p),
      () => alive && setSaved({}),
    );
    return () => {
      alive = false;
    };
  }, [client.projectId, connection.id, place]);

  // 多い DB で「この表のまわり」から開いたら、そのテーブルと直接つながるテーブルを選んで描く
  const tooMany = schema !== null && tab.names === null && schema.tables.length === 0 && schema.names.length > DB_ER_AUTO_MAX;
  useEffect(() => {
    if (!tooMany || !tab.focus) return;
    let alive = true;
    api.dbTable(client.projectId, connection.id, tab.path, tab.focus, worktree).then(
      (d) => {
        if (!alive) return;
        const near = [tab.focus!, ...d.foreign_keys.map((f) => f.ref_table), ...d.referenced_by.filter((r) => r.schema === tab.path.schema || r.schema === null).map((r) => r.table)];
        onChange({ names: [...new Set(near)].filter((n) => schema!.names.includes(n)).slice(0, DB_ER_MAX) });
      },
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooMany, tab.focus]);

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
  useEffect(() => {
    if (!missing) return;
    const run = ++layoutRun.current;
    void erAutoLayout(
      shown.map((t) => ({ id: t.name, ...sizes.get(t.name)! })),
      shownRelations,
    ).then((p) => {
      if (run === layoutRun.current) setAuto((a) => ({ ...a, ...p }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, shown, shownRelations]);

  const positionOf = useCallback((name: string) => saved?.[name] ?? auto[name] ?? null, [saved, auto]);

  /** 動かしたあとの位置を覚える（見せているものすべての位置を書き、ほかの覚えた位置は残す） */
  const savePositions = useCallback(
    (moved: DbErPositions) => {
      const next = { ...(saved ?? {}) };
      for (const t of shown) {
        const p = moved[t.name] ?? positionOf(t.name);
        if (p) next[t.name] = p;
      }
      setSaved(next);
      void api.saveDbErLayout(client.projectId, connection.id, place, next).catch(() => {});
    },
    [saved, shown, positionOf, client.projectId, connection.id, place],
  );

  /** 「自動で並べ直す」: 覚えた位置を消して並べ直す */
  const relayout = useCallback(async () => {
    await api.resetDbErLayout(client.projectId, connection.id, place).catch(() => {});
    setAuto({});
    setSaved({});
  }, [client.projectId, connection.id, place]);

  return {
    schema,
    error,
    loading,
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
    reload: () => setReload((n) => n + 1),
    savePositions,
    relayout,
  };
}

export type ErDiagramState = ReturnType<typeof useErDiagram>;
