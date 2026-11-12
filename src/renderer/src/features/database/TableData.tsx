import { Download, PanelRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { previewRowsSql } from "@shared/database/dbFilter";
import { errorMessage } from "@shared/errors";
import { DB_EDITS_MAX, DB_TABLE_PAGE_ROWS, type DbConnection, type DbFilter, type DbObjectPath, type DbRowFilter, type DbTableDetail } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import type { DbTableTab } from "@/lib/dbClientTabs";
import { downloadText } from "@/lib/download";
import { CopyButton } from "@/ui/CopyButton";
import { ErrorText } from "@/ui/ErrorText";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { CsvImportDialog } from "./CsvImportDialog";
import { DataGrid, type DataGridEdit } from "./DataGrid";
import { useDbClient } from "./dbClientContext";
import { durationLabel } from "./dbFormat";
import { columnKeysOf, DB_EXPORT_FORMATS, DB_EXPORT_TYPES, exportRows, hasLongValue, hasUnreadImage, type DbExportFormat } from "./dbRowTools";
import { TableCellMenu } from "./TableCellMenu";
import { TableEditBar } from "./TableEditBar";
import { addInserts, displayRows, setCell, setInsertCell } from "./tableEdits";
import { TableFilterBar } from "./TableFilterBar";
import { TableRowDetail } from "./TableRowDetail";
import type { TableEditsState } from "./useTableEdits";
import type { useTableRows } from "./useTableRows";

/** つながった行へ移る先（外部キーの参照先・この行を指しているテーブル） */
export interface RowLink {
  schema: string | null;
  table: string;
  filters: DbFilter[];
}

/** つながった行の場所（PostgreSQL は参照先のスキーマ、MySQL は参照先の DB、SQLite は同じ場所） */
function linkPath(connection: DbConnection, path: DbObjectPath, schema: string | null): DbObjectPath {
  if (!schema) return path;
  if (connection.engine === "postgres") return { database: path.database, schema };
  if (connection.engine === "mysql") return { database: schema, schema: null };
  return path;
}

/**
 * テーブルのデータ: 絞り込みの帯・編集の帯・表（右クリックで「この値で絞る / 除く」・参照先の行を開く・NULL にする・行を消す）・行の詳細・下の帯
 * （流す SQL・行数・正確に数える・書き出し CSV / TSV / JSON）。セルの書き換え・足す行・消す行は edit（TableView が持つ）に、保存するまで持つ
 */
export function TableData({
  data,
  detail,
  connection,
  tab,
  worktree,
  edit,
  onFilter,
}: {
  data: ReturnType<typeof useTableRows>;
  detail: DbTableDetail | undefined;
  connection: DbConnection;
  tab: DbTableTab;
  worktree: string | null;
  edit: TableEditsState;
  onFilter: (filter: DbRowFilter | null) => void;
}) {
  const client = useDbClient();
  const [exact, setExact] = useState<number | "counting" | null>(null);
  const [countError, setCountError] = useState<string>();
  const [pickedRow, setPickedRow] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const menu = useContextMenu<{ row: number; col: number }>();
  const exportMenu = useContextMenu();
  const [importing, setImporting] = useState(false);
  const [pickRequest, setPickRequest] = useState<{ row: number; col: number } | null>(null);
  const filterKey = JSON.stringify(tab.filter ?? null);
  useEffect(() => setExact(null), [tab.key, filterKey]);
  const onPickRow = useCallback((row: number | null) => setPickedRow(row), []);

  const columns = useMemo(() => detail?.columns.map((c) => c.name) ?? data.result?.columns.map((c) => c.name) ?? [], [detail, data.result]);
  // 見出しの 🔑 主キー・↗ 外部キー
  const keys = useMemo(() => (detail ? columnKeysOf(detail) : undefined), [detail]);
  const result = data.result;
  const { edits, keyColumns, writable } = edit;
  const display = useMemo(() => (result ? displayRows(result.columns, result.rows, keyColumns, edits) : null), [result, keyColumns, edits]);
  const gridEdit = useMemo((): DataGridEdit | undefined => {
    if (!display || !result) return undefined;
    return {
      canEdit: (row, col) => {
        const value = display.rows[row]?.[col];
        if (!writable || value === undefined || (value !== null && typeof value === "object")) return false;
        return display.insertIds[row] !== null || (display.keys[row] !== null && display.rowState(row) !== "deleted");
      },
      rowState: display.rowState,
      cellState: display.cellState,
      onCommit: (row, col, text) => {
        const name = result.columns[col].name;
        const insertId = display.insertIds[row];
        const key = display.keys[row];
        if (insertId !== null) edit.change((e) => setInsertCell(e, insertId, name, text));
        else if (key) edit.change((e) => setCell(e, key, name, text, result.rows[row][col]));
      },
    };
    // edit.change は描き直しごとに作り直すが、中で読むのはいちばん新しい変更なので、表の中身が変わったときだけ作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, result, writable]);
  /** 行を足して、その行の頭のセルを選ぶ */
  const addRow = () => {
    if (!display) return;
    edit.change((e) => addInserts(e, [{}]));
    setPickRequest({ row: display.rows.length, col: 0 });
  };

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
  // 書き出す前に、頭だけの長い文字の残りを読む
  const exportAs = async (format: DbExportFormat) => {
    if (!result) return;
    const long = result.rows.flatMap((r, i) => (hasLongValue(r) ? [i] : []));
    const rows = long.length > 0 ? ((await data.fill(long, keyColumns)) ?? result.rows) : result.rows;
    downloadText(`${tab.name}.${format}`, exportRows(result.columns, rows, format), DB_EXPORT_TYPES[format]);
  };
  const quote = connection.engine === "mysql" ? (n: string) => `\`${n.replaceAll("`", "``")}\`` : (n: string) => `"${n.replaceAll('"', '""')}"`;
  const sql = previewRowsSql(tab.name, data.filter, data.sort, quote, DB_TABLE_PAGE_ROWS);
  const shown = result?.rows.length ?? 0;
  const filtered = Boolean(tab.filter);
  const detailRow = showDetail && pickedRow !== null && display ? display.rows[pickedRow] : undefined;
  // 選んだ行に頭だけの長い文字があれば、行の詳細を開いているとき・書き換えられるときに残りを読む（書き直しは全体の値から）。
  // 画像のバイナリは、行の詳細を開いているときに中身を読んで縮小表示する
  const pickedRead = pickedRow !== null && result && pickedRow < result.rows.length ? result.rows[pickedRow] : undefined;
  const needFill = Boolean(pickedRead && ((hasLongValue(pickedRead) && (showDetail || writable)) || (hasUnreadImage(pickedRead) && showDetail)));
  useEffect(() => {
    if (needFill && pickedRow !== null) void data.fill([pickedRow], keyColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needFill, pickedRow]);

  return (
    <div className="db-table-data">
      <TableFilterBar columns={columns} applied={tab.filter} onApply={onFilter} />
      {detail && <TableEditBar state={edit} connection={connection} onAddRow={addRow} onImportCsv={() => setImporting(true)} />}
      <div className="db-table-body">
        {result && display && (
          <DataGrid
            columns={result.columns}
            rows={display.rows}
            sort={data.sort}
            onSort={data.sortBy}
            onPickRow={onPickRow}
            onCellMenu={(e, row, col) => menu.open(e, { row, col })}
            edit={gridEdit}
            pickRequest={pickRequest}
            keys={keys}
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
        {result && <span className="muted">{durationLabel(result.duration_ms)}</span>}
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
            <MenuItem key={f} onSelect={() => void exportAs(f)}>
              {f.toUpperCase()}（読み込んだ {shown.toLocaleString()} 行）
            </MenuItem>
          ))}
        </PopupMenu>
      )}
      {menu.menu && result && display && (
        <TableCellMenu
          at={menu.menu.at}
          row={menu.menu.value.row}
          col={menu.menu.value.col}
          result={result}
          display={display}
          detail={detail}
          edit={edit}
          onClose={menu.close}
          onFilter={addFilter}
          onLink={openLink}
        />
      )}
      {importing && (
        <CsvImportDialog
          table={tab.name}
          columns={columns}
          room={DB_EDITS_MAX - edit.counts.total}
          onImport={(rows) => {
            edit.change((e) => addInserts(e, rows));
            if (display) setPickRequest({ row: display.rows.length, col: 0 });
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}
