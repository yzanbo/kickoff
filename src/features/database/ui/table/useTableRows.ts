import { useState } from "react";
import { errorMessage } from "@shared/foundation/errors";
import type { DbConnection, DbQueryResult, DbRowFilter, DbSort, DbValue } from "@shared/database/types";
import { dbApi, dbAt } from "@/features/database/ui/api";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useQuery } from "@/foundation/ui/query";
import type { DbTableTab } from "@/features/database/ui/dbClientTabs";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import { nextSort } from "@/features/database/ui/dbFormat";
import { hasLongValue, hasUnreadImage, rowKeyFilters } from "./dbRowTools";

const NO_FILTER: DbRowFilter = { filters: [], where: null };

/**
 * テーブルの行（絞り込み・並べ替え・続きを読む）。長い文字は頭だけ届くので、行の詳細・書き直し・書き出しの前に、
 * 行を指すキーの列（keyColumns）で 1 行ずつ全体を読み直して差し替える（fill）
 */
export function useTableRows(tab: DbTableTab, connection: DbConnection, worktree: string | null) {
  const client = useDbClient();
  const [sort, setSort] = useState<DbSort[]>([]);
  // 続き・長い値の読み直しの失敗と、続きを読んでいる間
  const [moreError, setMoreError] = useState<string>();
  const [moreLoading, setMoreLoading] = useState(false);
  // 裏のタブの結果が多すぎて捨てた（戻ったら取り直す。resultBudget.ts）
  const [evicted, setEvicted] = useState(false);
  const filter = tab.filter ?? NO_FILTER;
  const at = dbAt(client.projectId, connection.id, worktree);
  const page = (offset: number) => dbApi("POST /api/projects/:projectId/db-connections/:connectionId/rows", { ...at, body: { path: tab.path, table: tab.name, sort, offset, filter } });
  // 読み直すのは、タブ・接続・作業場所・並べ替え・絞り込みの中身が変わったときと、頼まれたときだけ（古い応答は捨てる）
  const rows = useQuery<DbQueryResult | null>(["useTableRows", tab.key, connection.id, worktree, JSON.stringify(sort), JSON.stringify(filter)], () => (setMoreError(undefined), page(0)), { keepPrevious: true });
  // 最初の頁を読めなければ行を出さない
  const result = rows.error ? null : (rows.data ?? null);
  // fill が読むいちばん新しい結果（読み直している間に取り直したら、差し替えない）
  const latestRef = useLatest(result);

  /**
   * 頭だけの長い文字・まだ中身を読んでいない画像がある行（indexes の中）を全体のまま読み直して差し替え、差し替えたあとの行を返す
   * （キーの列がない・読めなかった行は頭のまま。読み直している間に取り直したら null）
   */
  const fill = async (indexes: number[], keyColumns: string[] | null): Promise<DbValue[][] | null> => {
    const base = latestRef.current;
    if (!base) return null;
    const next = [...base.rows];
    let changed = false;
    for (const i of indexes) {
      const row = next[i];
      if (!row || !(hasLongValue(row) || hasUnreadImage(row))) continue;
      const filters = rowKeyFilters(base.columns, row, keyColumns);
      if (!filters) continue;
      try {
        const full = await dbApi("POST /api/projects/:projectId/db-connections/:connectionId/full-row", { ...at, body: { path: tab.path, table: tab.name, filters } });
        if (full.columns.length !== base.columns.length) continue;
        next[i] = full.row;
        changed = true;
      } catch (e) {
        setMoreError(`長い値の残りを読めませんでした: ${errorMessage(e)}`);
      }
    }
    if (latestRef.current !== base) return null;
    if (changed) {
      const filled = { ...base, rows: next };
      latestRef.current = filled;
      rows.setData((prev) => (prev === base ? filled : prev));
    }
    return next;
  };

  const more = async () => {
    if (!result) return;
    setMoreLoading(true);
    setMoreError(undefined);
    try {
      const got = await page(result.rows.length);
      rows.setData((prev) => (prev ? { ...got, rows: [...prev.rows, ...got.rows] } : prev));
    } catch (e) {
      setMoreError(errorMessage(e));
    }
    setMoreLoading(false);
  };

  return {
    sort,
    filter,
    result,
    loading: rows.loading || moreLoading,
    error: rows.error ? errorMessage(rows.error) : moreError,
    sortBy: (column: string, add = false) => setSort((s) => nextSort(s, column, add)),
    more: () => void more(),
    reload: () => {
      setEvicted(false);
      void rows.reload();
    },
    evicted,
    /** 結果を捨てる（裏のタブの量が多すぎるとき） */
    evict: () => {
      latestRef.current = null;
      rows.setData(null);
      setEvicted(true);
    },
    fill,
  };
}
