import { ArrowUpRight, Ban, Copy, Filter, FilterX, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import type { DbFilter, DbQueryResult, DbTableDetail } from "@shared/types";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import type { RowLink } from "./TableData";
import { foreignKeysByColumn, linkFilters, valueFilter } from "./dbRowTools";
import { removeInsert, revertCell, setCell, setInsertCell, toggleDelete, type TableDisplay } from "./tableEdits";
import type { TableEditsState } from "./useTableEdits";

/**
 * テーブルのデータのセルの右クリック: 「この値で絞る / 除く」・外部キーの参照先の行を開く・「値をコピー」と、
 * 書き換えられるときは「NULL にする」「変更を戻す」「この行を消す / 消すのをやめる」（足す行は「既定値に戻す」「行を外す」）
 */
export function TableCellMenu({
  at,
  row,
  col,
  result,
  display,
  detail,
  edit,
  onClose,
  onFilter,
  onLink,
}: {
  at: Placement;
  row: number;
  col: number;
  result: DbQueryResult;
  display: TableDisplay;
  detail: DbTableDetail | undefined;
  edit: TableEditsState;
  onClose: () => void;
  onFilter: (filter: DbFilter) => void;
  onLink: (link: RowLink) => void;
}) {
  const column = result.columns[col];
  const value = display.rows[row]?.[col];
  if (!column || value === undefined) return null;
  // 読んだ行（足す行でない）
  const read = row < result.rows.length;
  const key = display.keys[row];
  const insertId = display.insertIds[row];
  const state = display.cellState(row, col);
  const deleted = display.rowState(row) === "deleted";
  const nullable = detail?.columns.find((c) => c.name === column.name)?.nullable ?? true;
  const binary = value !== null && typeof value === "object";
  const canEditCell = edit.writable && !binary && !deleted && (insertId !== null || key !== null);
  const keep = read ? valueFilter(column.name, value, false) : null;
  const drop = read ? valueFilter(column.name, value, true) : null;
  const fks = read ? (foreignKeysByColumn(detail?.foreign_keys ?? []).get(column.name) ?? []) : [];
  const setNull = () => {
    if (insertId !== null) edit.change((e) => setInsertCell(e, insertId, column.name, null));
    else if (key) edit.change((e) => setCell(e, key, column.name, null, result.rows[row][col]));
  };

  return (
    <PopupMenu at={at} label="セルのメニュー" onClose={onClose}>
      <MenuItem disabled={!keep} onSelect={() => keep && onFilter(keep)}>
        <Filter size={14} /> この値で絞る
      </MenuItem>
      <MenuItem disabled={!drop} onSelect={() => drop && onFilter(drop)}>
        <FilterX size={14} /> この値を除く
      </MenuItem>
      {fks.map((fk) => {
        const filters = linkFilters(result.rows[row], result.columns, fk.columns, fk.ref_columns);
        return (
          <MenuItem key={`${fk.ref_table}:${fk.columns.join(",")}`} disabled={!filters} onSelect={() => filters && onLink({ schema: fk.ref_schema, table: fk.ref_table, filters })}>
            <ArrowUpRight size={14} /> {fk.ref_table} の行を開く
          </MenuItem>
        );
      })}
      <MenuItem disabled={value === null || binary || state === "default"} onSelect={() => void navigator.clipboard.writeText(value === null || binary ? "" : String(value))}>
        <Copy size={14} /> 値をコピー
      </MenuItem>
      {edit.writable && (insertId !== null || key !== null) && (
        <>
          <div className="menu-separator" role="separator" />
          <MenuItem disabled={!canEditCell || !nullable || (value === null && state !== "default")} onSelect={setNull} title={nullable ? undefined : "この列は NULL を許しません"}>
            <Ban size={14} /> NULL にする
          </MenuItem>
          {insertId !== null ? (
            <>
              <MenuItem disabled={state !== "changed"} onSelect={() => edit.change((e) => setInsertCell(e, insertId, column.name, undefined))}>
                <RotateCcw size={14} /> 既定値に戻す
              </MenuItem>
              <MenuItem onSelect={() => edit.change((e) => removeInsert(e, insertId))}>
                <X size={14} /> 足す行を外す
              </MenuItem>
            </>
          ) : (
            key && (
              <>
                <MenuItem disabled={state !== "changed"} onSelect={() => edit.change((e) => revertCell(e, key, column.name))}>
                  <RotateCcw size={14} /> 変更を戻す
                </MenuItem>
                <MenuItem danger={!deleted} onSelect={() => edit.change((e) => toggleDelete(e, key))}>
                  {deleted ? (
                    <>
                      <Undo2 size={14} /> 消すのをやめる
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} /> この行を消す
                    </>
                  )}
                </MenuItem>
              </>
            )
          )}
        </>
      )}
    </PopupMenu>
  );
}
