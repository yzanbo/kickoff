import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { DbColumnInfo, DbSort, DbValue } from "@shared/types";
import { cx } from "@/lib/cx";
import { cellKind, cellText } from "./dbFormat";

/** 行の高さ（見えている所だけ描くので、どの行も同じ高さにする） */
const ROW_HEIGHT = 26;
/** 見えている所の前後に余分に描く行の数 */
const OVERSCAN = 12;
/** 列の幅 */
const COLUMN_WIDTH = 180;
const INDEX_WIDTH = 52;

/**
 * DB の結果の表（テーブルのデータ・SQL の結果で共通）。行は見えている所だけ描く（何千行でも重くしない）。
 * 列の見出しを押すと onSort（渡したときだけ。並べ替えの印は sort）。セルを押すと選び、⌘C でその文をコピーする。
 * セルの文は 1 行に収め、全部は乗せたときの説明に出す（NULL・バイナリは薄く、数は右寄せ）。
 * onPickRow は選んだセルの行（行の詳細）、onCellMenu はセルの右クリック（選んでから開く）
 */
export function DataGrid({
  columns,
  rows,
  sort,
  onSort,
  rowOffset = 0,
  className,
  onPickRow,
  onCellMenu,
}: {
  columns: DbColumnInfo[];
  rows: DbValue[][];
  sort?: DbSort[];
  onSort?: (column: string) => void;
  /** 行の番号の始まり（テーブルの続きを読んだとき。0 なら 1 から） */
  rowOffset?: number;
  className?: string;
  onPickRow?: (row: number | null) => void;
  onCellMenu?: (e: React.MouseEvent, row: number, col: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 400 });
  const [picked, setPicked] = useState<{ row: number; col: number } | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // 結果が変わったら選んだセルを外す
  useEffect(() => setPicked(null), [rows, columns]);
  useEffect(() => onPickRow?.(picked?.row ?? null), [picked?.row, onPickRow]);

  const first = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN);
  const template = { "--db-grid-cols": `${INDEX_WIDTH}px repeat(${columns.length}, ${COLUMN_WIDTH}px)` } as CSSProperties;

  const onKeyDown = (e: KeyboardEvent) => {
    if (!picked || !(e.metaKey || e.ctrlKey) || e.key !== "c") return;
    const value = rows[picked.row]?.[picked.col];
    if (value === undefined) return;
    e.preventDefault();
    void navigator.clipboard.writeText(value === null ? "" : cellText(value));
  };

  return (
    <div
      ref={scroller}
      className={cx("db-grid", className)}
      style={template}
      tabIndex={0}
      role="grid"
      aria-rowcount={rows.length}
      onScroll={(e) => {
        // 更新の関数はあとで呼ばれ、そのときイベントの currentTarget は null になっているので、先に読んでおく
        const top = e.currentTarget.scrollTop;
        setView((v) => ({ ...v, top }));
      }}
      onKeyDown={onKeyDown}
    >
      <div className="db-grid-head" role="row">
        <span className="db-grid-index" />
        {columns.map((c, i) => {
          const s = sort?.find((x) => x.column === c.name);
          const label = (
            <>
              <span className="db-grid-col-name">{c.name}</span>
              {c.type && <span className="db-grid-col-type">{c.type}</span>}
              {s && (s.desc ? <ArrowDown size={11} aria-label="降順" /> : <ArrowUp size={11} aria-label="昇順" />)}
            </>
          );
          return onSort ? (
            <button key={i} type="button" role="columnheader" className="db-grid-col" title={`${c.name}${c.type ? `（${c.type}）` : ""} で並べ替え`} onClick={() => onSort(c.name)}>
              {label}
            </button>
          ) : (
            <span key={i} role="columnheader" className="db-grid-col" title={c.type ? `${c.name}（${c.type}）` : c.name}>
              {label}
            </span>
          );
        })}
      </div>
      <div className="db-grid-body" style={{ height: rows.length * ROW_HEIGHT }}>
        {rows.slice(first, last).map((row, i) => {
          const index = first + i;
          return (
            <div key={index} className="db-grid-row" role="row" style={{ top: index * ROW_HEIGHT }}>
              <span className="db-grid-index">{rowOffset + index + 1}</span>
              {row.map((value, col) => {
                const text = cellText(value);
                return (
                  <span
                    key={col}
                    role="gridcell"
                    className={cx("db-grid-cell", `db-cell-${cellKind(value)}`, picked?.row === index && picked.col === col && "picked")}
                    title={text.length > 20 ? text : undefined}
                    onMouseDown={() => setPicked({ row: index, col })}
                    onContextMenu={
                      onCellMenu
                        ? (e) => {
                            setPicked({ row: index, col });
                            onCellMenu(e, index, col);
                          }
                        : undefined
                    }
                  >
                    {text}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
