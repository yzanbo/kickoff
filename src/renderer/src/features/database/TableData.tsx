import { ArrowUpRight, Copy, Download, Filter, FilterX, PanelRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { previewRowsSql } from "@shared/database/dbFilter";
import { errorMessage } from "@shared/errors";
import { DB_TABLE_PAGE_ROWS, type DbConnection, type DbFilter, type DbObjectPath, type DbQueryResult, type DbRowFilter, type DbSort, type DbTableDetail } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import type { DbTableTab } from "@/lib/dbClientTabs";
import { downloadText } from "@/lib/download";
import { CopyButton } from "@/ui/CopyButton";
import { ErrorText } from "@/ui/ErrorText";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { DataGrid } from "./DataGrid";
import { useDbClient } from "./dbClientContext";
import { nextSort } from "./dbFormat";
import { DB_EXPORT_FORMATS, DB_EXPORT_TYPES, exportRows, foreignKeysByColumn, linkFilters, valueFilter, type DbExportFormat } from "./dbRowTools";
import { TableFilterBar } from "./TableFilterBar";
import { TableRowDetail } from "./TableRowDetail";

/** つながった行へ移る先（外部キーの参照先・この行を指しているテーブル） */
export interface RowLink {
  schema: string | null;
  table: string;
  filters: DbFilter[];
}

const NO_FILTER: DbRowFilter = { filters: [], where: null };

/** テーブルの行（絞り込み・並べ替え・続きを読む） */
export function useTableRows(tab: DbTableTab, connection: DbConnection, worktree: string | null) {
  const client = useDbClient();
  const [sort, setSort] = useState<DbSort[]>([]);
  const [result, setResult] = useState<DbQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(0);
  const filter = tab.filter ?? NO_FILTER;
  const filterKey = JSON.stringify(filter);
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
  return {
    sort,
    filter,
    result,
    loading,
    error,
    sortBy: (column: string) => setSort((s) => nextSort(s, column)),
    more: () => result && void load(result.rows.length, result),
    reload: () => setNonce((n) => n + 1),
  };
}

/** つながった行の場所（PostgreSQL は参照先のスキーマ、MySQL は参照先の DB、SQLite は同じ場所） */
function linkPath(connection: DbConnection, path: DbObjectPath, schema: string | null): DbObjectPath {
  if (!schema) return path;
  if (connection.engine === "postgres") return { database: path.database, schema };
  if (connection.engine === "mysql") return { database: schema, schema: null };
  return path;
}

/**
 * テーブルのデータ: 絞り込みの帯・表（右クリックで「この値で絞る / 除く」・参照先の行を開く）・行の詳細・下の帯
 * （流す SQL・行数・正確に数える・書き出し CSV / TSV / JSON）
 */
export function TableData({
  data,
  detail,
  connection,
  tab,
  worktree,
  onFilter,
}: {
  data: ReturnType<typeof useTableRows>;
  detail: DbTableDetail | undefined;
  connection: DbConnection;
  tab: DbTableTab;
  worktree: string | null;
  onFilter: (filter: DbRowFilter | null) => void;
}) {
  const client = useDbClient();
  const [exact, setExact] = useState<number | "counting" | null>(null);
  const [countError, setCountError] = useState<string>();
  const [pickedRow, setPickedRow] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const menu = useContextMenu<{ row: number; col: number }>();
  const exportMenu = useContextMenu();
  const filterKey = JSON.stringify(tab.filter ?? null);
  useEffect(() => setExact(null), [tab.key, filterKey]);
  const onPickRow = useCallback((row: number | null) => setPickedRow(row), []);

  const columns = useMemo(() => detail?.columns.map((c) => c.name) ?? data.result?.columns.map((c) => c.name) ?? [], [detail, data.result]);
  const fks = useMemo(() => foreignKeysByColumn(detail?.foreign_keys ?? []), [detail]);
  const result = data.result;

  const count = async () => {
    setExact("counting");
    setCountError(undefined);
    try {
      setExact((await api.dbCount(client.projectId, connection.id, tab.path, tab.name, data.filter, worktree)).count);
    } catch (e) {
      setCountError(errorMessage(e));
      setExact(null);
    }
  };
  /** 絞り込みに条件を足す（WHERE の文で絞っていたら、条件に切り替える） */
  const addFilter = (f: DbFilter) => onFilter({ filters: [...(tab.filter?.where ? [] : (tab.filter?.filters ?? [])), f], where: null });
  const openLink = (link: RowLink) => client.openTable(connection, linkPath(connection, tab.path, link.schema), link.table, "table", { filters: link.filters, where: null });
  const exportAs = (format: DbExportFormat) => {
    if (!result) return;
    downloadText(`${tab.name}.${format}`, exportRows(result.columns, result.rows, format), DB_EXPORT_TYPES[format]);
  };
  const quote = connection.engine === "mysql" ? (n: string) => `\`${n.replaceAll("`", "``")}\`` : (n: string) => `"${n.replaceAll('"', '""')}"`;
  const sql = previewRowsSql(tab.name, data.filter, data.sort, quote, DB_TABLE_PAGE_ROWS);
  const shown = result?.rows.length ?? 0;
  const filtered = Boolean(tab.filter);
  const picked = menu.menu?.value;
  const pickedCol = picked && result ? result.columns[picked.col] : null;
  const pickedValue = picked && result ? result.rows[picked.row]?.[picked.col] : undefined;
  const detailRow = showDetail && pickedRow !== null && result ? result.rows[pickedRow] : undefined;

  return (
    <div className="db-table-data">
      <TableFilterBar columns={columns} applied={tab.filter} onApply={onFilter} />
      <div className="db-table-body">
        {result && (
          <DataGrid
            columns={result.columns}
            rows={result.rows}
            sort={data.sort}
            onSort={data.sortBy}
            onPickRow={onPickRow}
            onCellMenu={(e, row, col) => menu.open(e, { row, col })}
          />
        )}
        {result && showDetail && (
          detailRow ? (
            <TableRowDetail columns={result.columns} row={detailRow} index={pickedRow!} detail={detail} onLink={openLink} onClose={() => setShowDetail(false)} />
          ) : (
            <aside className="db-row-detail db-row-detail-empty small muted">セルを押すと、その行の詳細を出します。</aside>
          )
        )}
      </div>
      <ErrorText message={data.error ?? countError} className="db-table-error" />
      <div className="db-table-foot small">
        <span>
          {shown.toLocaleString()} 行を表示{filtered && "（絞り込み中）"}
        </span>
        {result?.truncated && (
          <button type="button" className="btn btn-sm" disabled={data.loading} onClick={data.more}>
            {data.loading ? "読み込み中…" : "さらに 100 行読む"}
          </button>
        )}
        <span className="db-table-count muted">
          {typeof exact === "number"
            ? `${filtered ? "当てはまる行" : "全体"} ${exact.toLocaleString()} 行`
            : !filtered && detail?.estimated_rows != null
              ? `全体 約 ${detail.estimated_rows.toLocaleString()} 行（推定）`
              : filtered
                ? "当てはまる行は数えていません"
                : "全体の行数は数えていません"}
        </span>
        {typeof exact !== "number" && (
          <button type="button" className="link-button small" disabled={exact === "counting"} onClick={() => void count()}>
            {exact === "counting" ? "数えています…" : "正確に数える"}
          </button>
        )}
        <code className="db-table-sql" title={sql}>
          {sql}
        </code>
        <CopyButton label="流す SQL をコピー" size={12} text={sql} />
        <button type="button" className={cx("btn btn-sm", showDetail && "active")} aria-pressed={showDetail} onClick={() => setShowDetail((v) => !v)} data-tip="選んだセルの行を右に縦に並べる">
          <PanelRight size={12} aria-hidden /> 行の詳細
        </button>
        <button type="button" className="btn btn-sm" disabled={!result || shown === 0} onClick={(e) => exportMenu.toggle(e, undefined)} aria-haspopup="menu" data-tip="読み込んだ行をファイルに書き出す">
          <Download size={12} aria-hidden /> 書き出す
        </button>
      </div>
      {exportMenu.menu && (
        <PopupMenu at={exportMenu.menu.at} label="書き出す形" onClose={exportMenu.close}>
          {DB_EXPORT_FORMATS.map((f) => (
            <MenuItem key={f} onSelect={() => exportAs(f)}>
              {f.toUpperCase()}（読み込んだ {shown.toLocaleString()} 行）
            </MenuItem>
          ))}
        </PopupMenu>
      )}
      {menu.menu && picked && pickedCol && pickedValue !== undefined && result && (
        <PopupMenu at={menu.menu.at} label="セルのメニュー" onClose={menu.close}>
          {(() => {
            const keep = valueFilter(pickedCol.name, pickedValue, false);
            const drop = valueFilter(pickedCol.name, pickedValue, true);
            return (
              <>
                <MenuItem disabled={!keep} onSelect={() => keep && addFilter(keep)}>
                  <Filter size={14} /> この値で絞る
                </MenuItem>
                <MenuItem disabled={!drop} onSelect={() => drop && addFilter(drop)}>
                  <FilterX size={14} /> この値を除く
                </MenuItem>
              </>
            );
          })()}
          {(fks.get(pickedCol.name) ?? []).map((fk) => {
            const filters = linkFilters(result.rows[picked.row], result.columns, fk.columns, fk.ref_columns);
            return (
              <MenuItem key={`${fk.ref_table}:${fk.columns.join(",")}`} disabled={!filters} onSelect={() => filters && openLink({ schema: fk.ref_schema, table: fk.ref_table, filters })}>
                <ArrowUpRight size={14} /> {fk.ref_table} の行を開く
              </MenuItem>
            );
          })}
          <MenuItem
            disabled={pickedValue === null || typeof pickedValue === "object"}
            onSelect={() => void navigator.clipboard.writeText(pickedValue === null || typeof pickedValue === "object" ? "" : String(pickedValue))}
          >
            <Copy size={14} /> 値をコピー
          </MenuItem>
        </PopupMenu>
      )}
    </div>
  );
}
