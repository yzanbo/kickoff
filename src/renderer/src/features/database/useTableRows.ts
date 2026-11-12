import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@shared/errors";
import type { DbConnection, DbQueryResult, DbRowFilter, DbSort, DbValue } from "@shared/types";
import { api } from "@/api";
import type { DbTableTab } from "@/lib/dbClientTabs";
import { useDbClient } from "./dbClientContext";
import { nextSort } from "./dbFormat";
import { hasLongValue, rowKeyFilters } from "./dbRowTools";

const NO_FILTER: DbRowFilter = { filters: [], where: null };

/**
 * テーブルの行（絞り込み・並べ替え・続きを読む）。長い文字は頭だけ届くので、行の詳細・書き直し・書き出しの前に、
 * 行を指すキーの列（keyColumns）で 1 行ずつ全体を読み直して差し替える（fill）
 */
export function useTableRows(tab: DbTableTab, connection: DbConnection, worktree: string | null) {
  const client = useDbClient();
  const [sort, setSort] = useState<DbSort[]>([]);
  const [result, setResult] = useState<DbQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(0);
  const filter = tab.filter ?? NO_FILTER;
  const filterKey = JSON.stringify(filter);
  // fill が読むいちばん新しい結果（読み直している間に取り直したら、差し替えない）
  const latest = useRef(result);
  latest.current = result;
  const load = async (offset: number, base: DbQueryResult | null) => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await api.dbRows(client.projectId, connection.id, { path: tab.path, table: tab.name, sort, offset, filter }, worktree);
      setResult(base ? { ...page, rows: [...base.rows, ...page.rows] } : page);
    } catch (e) {
      setError(errorMessage(e));
      if (!base) setResult(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(0, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.key, connection.id, worktree, sort, nonce, filterKey]);

  /**
   * 頭だけの長い文字がある行（indexes の中）を全体のまま読み直して差し替え、差し替えたあとの行を返す
   * （キーの列がない・読めなかった行は頭のまま。読み直している間に取り直したら null）
   */
  const fill = async (indexes: number[], keyColumns: string[] | null): Promise<DbValue[][] | null> => {
    const base = latest.current;
    if (!base) return null;
    const rows = [...base.rows];
    let changed = false;
    for (const i of indexes) {
      const row = rows[i];
      if (!row || !hasLongValue(row)) continue;
      const filters = rowKeyFilters(base.columns, row, keyColumns);
      if (!filters) continue;
      try {
        const full = await api.dbFullRow(client.projectId, connection.id, { path: tab.path, table: tab.name, filters }, worktree);
        if (full.columns.length !== base.columns.length) continue;
        rows[i] = full.row;
        changed = true;
      } catch (e) {
        setError(`長い値の残りを読めませんでした: ${errorMessage(e)}`);
      }
    }
    if (latest.current !== base) return null;
    if (changed) {
      const next = { ...base, rows };
      latest.current = next;
      setResult(next);
    }
    return rows;
  };

  return {
    sort,
    filter,
    result,
    loading,
    error,
    sortBy: (column: string) => setSort((s) => nextSort(s, column)),
    more: () => result && void load(result.rows.length, result),
    reload: () => setNonce((n) => n + 1),
    fill,
  };
}
