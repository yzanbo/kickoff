import { ArrowDown, ArrowUp, ArrowUpRight, KeyRound } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { DbColumnInfo, DbSort, DbValue } from "@shared/types";
import { cx } from "@/lib/cx";
import { isCancelKey, isComposing, isKey, isSubmitKey } from "@/lib/keys";
import { cellKind, cellText } from "./dbFormat";
import type { ColumnKeys } from "./dbRowTools";
import { editableText, type TableCellState, type TableRowState } from "./tableEdits";

/** 行の高さ（見えている所だけ描くので、どの行も同じ高さにする） */
const ROW_HEIGHT = 26;
/** 見えている所の前後に余分に描く行の数 */
const OVERSCAN = 12;
/** 見えている所の左右に余分に描く列の数（列も見えている所だけ描く。何百列でも重くしない） */
const COL_OVERSCAN = 3;
/** 列の幅 */
const COLUMN_WIDTH = 180;
const INDEX_WIDTH = 52;
/** 列の見出しの高さ（上に貼り付くので、選んだセルを見せるときに除く） */
const HEAD_HEIGHT = 28;

/** 行の番号の列はいつもグリッドの 1 列目 */
const INDEX_PLACE: CSSProperties = { gridColumn: 1 };

const MOVES: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** セルの書き直し（テーブルのデータ。渡したときだけ） */
export interface DataGridEdit {
  canEdit: (row: number, col: number) => boolean;
  rowState: (row: number) => TableRowState;
  cellState: (row: number, col: number) => TableCellState;
  /** 書き直した文を決めた（初めの文から変えたときだけ） */
  onCommit: (row: number, col: number, text: string) => void;
}

/**
 * DB の結果の表（テーブルのデータ・SQL の結果で共通）。行も列も見えている所だけ描く（何千行・何百列でも重くしない）。
 * 列の見出しを押すと onSort（渡したときだけ。⇧ を押しながらなら add で今の並べ替えに足す。並べ替えの印は sort、2 列以上なら何番目か）。セルを押すと選び、⌘C でその文をコピーする。
 * セルの文は 1 行に収め、全部は乗せたときの説明に出す（NULL・バイナリは薄く、数は右寄せ）。
 * onPickRow は選んだセルの行（行の詳細）、onCellMenu はセルの右クリック（選んでから開く）。↑↓←→ で選ぶセルを動かす。
 * edit を渡すと、ダブルクリック・Enter・F2 でセルを書き直す（Enter で決める・Shift+Enter で改行・Esc でやめる・外を押すと決める）
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
  edit,
  pickRequest,
  keys,
}: {
  columns: DbColumnInfo[];
  rows: DbValue[][];
  sort?: DbSort[];
  onSort?: (column: string, add: boolean) => void;
  /** 行の番号の始まり（テーブルの続きを読んだとき。0 なら 1 から） */
  rowOffset?: number;
  className?: string;
  onPickRow?: (row: number | null) => void;
  onCellMenu?: (e: React.MouseEvent, row: number, col: number) => void;
  edit?: DataGridEdit;
  /** このセルを選んで見せる（足した行など。新しい物を渡すたびに） */
  pickRequest?: { row: number; col: number } | null;
  /** 見出しに 🔑 主キー・↗ 外部キーを出す列（テーブルのタブだけ。SQL の結果はどのテーブルの列か分からないので渡さない） */
  keys?: ColumnKeys;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 400, left: 0, width: 1200 });
  const [picked, setPicked] = useState<{ row: number; col: number } | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight, left: el.scrollLeft, width: el.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [editing, setEditing] = useState<{ row: number; col: number; text: string; initial: string } | null>(null);
  // 決めるのを 1 回にする（Enter で決めたあと、欄が消えるときの blur で二度決めない）
  const editingRef = useRef(editing);
  editingRef.current = editing;
  // 結果が変わったら選んだセルを外す（書き直しで行が描き直されても、列が同じなら残す）
  useEffect(() => {
    setPicked(null);
    setEditing(null);
  }, [columns]);
  useEffect(() => {
    if (picked && picked.row >= rows.length) setPicked(null);
  }, [rows.length, picked]);
  useEffect(() => onPickRow?.(picked?.row ?? null), [picked?.row, onPickRow]);

  useEffect(() => {
    if (!pickRequest || pickRequest.row >= rows.length) return;
    setPicked(pickRequest);
    reveal(pickRequest.row, pickRequest.col);
    scroller.current?.focus();
    // 頼まれたときだけ（行が増えたあとに描かれる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickRequest]);

  const first = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN);
  const colFirst = Math.max(0, Math.floor((view.left - INDEX_WIDTH) / COLUMN_WIDTH) - COL_OVERSCAN);
  const colLast = Math.min(columns.length, Math.ceil((view.left + view.width) / COLUMN_WIDTH) + COL_OVERSCAN);
  /** 描く列（グリッドの何列目かを指定するので、描かない列の場所は空いたまま幅を保つ） */
  const shownCols = Array.from({ length: Math.max(0, colLast - colFirst) }, (_, i) => colFirst + i);
  const template = { "--db-grid-cols": `${INDEX_WIDTH}px repeat(${columns.length}, ${COLUMN_WIDTH}px)` } as CSSProperties;

  /** 選んだセルが見えるようにスクロールする（上の見出しと左の番号の列の下に隠さない） */
  const reveal = (row: number, col: number) => {
    const el = scroller.current;
    if (!el) return;
    const top = row * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (HEAD_HEIGHT + top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = HEAD_HEIGHT + top + ROW_HEIGHT - el.clientHeight;
    const left = col * COLUMN_WIDTH;
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (INDEX_WIDTH + left + COLUMN_WIDTH > el.scrollLeft + el.clientWidth) el.scrollLeft = INDEX_WIDTH + left + COLUMN_WIDTH - el.clientWidth;
  };

  /** セルの書き直しを始める（書き換えられないセルなら何もしない） */
  const startEdit = (row: number, col: number) => {
    const value = rows[row]?.[col];
    if (!edit || value === undefined || !edit.canEdit(row, col)) return;
    const text = edit.cellState(row, col) === "default" ? "" : editableText(value);
    if (text === null) return;
    reveal(row, col);
    setEditing({ row, col, text, initial: text });
  };

  /** 書き直しを終える（keep: 決める。refocus: 表にピントを戻す。外を押して終えたときは戻さない） */
  const finishEdit = (keep: boolean, refocus: boolean) => {
    const current = editingRef.current;
    if (!current) return;
    editingRef.current = null;
    setEditing(null);
    if (keep && current.text !== current.initial) edit?.onCommit(current.row, current.col, current.text);
    if (refocus) scroller.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (editing || !picked || isComposing(e)) return;
    if ((e.metaKey || e.ctrlKey) && e.key === "c") {
      const value = rows[picked.row]?.[picked.col];
      if (value === undefined) return;
      e.preventDefault();
      // NULL・空文字は空で写す（札の文を写さない）
      void navigator.clipboard.writeText(value === null || value === "" ? "" : cellText(value));
      return;
    }
    if (edit && (isKey(e, "Enter") || isKey(e, "F2"))) {
      e.preventDefault();
      startEdit(picked.row, picked.col);
      return;
    }
    const move = MOVES[e.key];
    if (move && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const row = Math.min(rows.length - 1, Math.max(0, picked.row + move[0]));
      const col = Math.min(columns.length - 1, Math.max(0, picked.col + move[1]));
      setPicked({ row, col });
      reveal(row, col);
    }
  };

  return (
    <div
      ref={scroller}
      className={cx("db-grid", className)}
      style={template}
      tabIndex={0}
      role="grid"
      aria-rowcount={rows.length}
      aria-colcount={columns.length}
      onScroll={(e) => {
        // 更新の関数はあとで呼ばれ、そのときイベントの currentTarget は null になっているので、先に読んでおく
        const { scrollTop: top, scrollLeft: left } = e.currentTarget;
        setView((v) => (v.top === top && v.left === left ? v : { ...v, top, left }));
      }}
      onKeyDown={onKeyDown}
    >
      <div className="db-grid-head" role="row">
        <span className="db-grid-index" style={INDEX_PLACE} />
        {shownCols.map((i) => {
          const c = columns[i];
          const s = sort?.find((x) => x.column === c.name);
          const order = s && sort && sort.length > 1 ? sort.indexOf(s) + 1 : null;
          const pk = keys?.primary.has(c.name) ?? false;
          const fk = keys?.foreign.get(c.name);
          const keyNote = [pk ? "主キー" : null, fk ? `外部キー → ${fk}` : null].filter(Boolean).join(" · ");
          const label = (
            <>
              {pk && <KeyRound size={11} className="db-grid-pk" aria-label="主キー" />}
              {fk && <ArrowUpRight size={11} className="db-grid-fk" aria-label={`外部キー → ${fk}`} />}
              <span className="db-grid-col-name">{c.name}</span>
              {c.type && <span className="db-grid-col-type">{c.type}</span>}
              {s && (s.desc ? <ArrowDown size={11} aria-label="降順" /> : <ArrowUp size={11} aria-label="昇順" />)}
              {order && <span className="db-grid-sort-order">{order}</span>}
            </>
          );
          return onSort ? (
            <button key={i} type="button" role="columnheader" className="db-grid-col" style={{ gridColumn: i + 2 }} aria-colindex={i + 1} title={`${c.name}${c.type ? `（${c.type}）` : ""}${keyNote ? ` ${keyNote}` : ""} で並べ替え（⇧ を押しながらで並べ替えに足す）`} onClick={(e) => onSort(c.name, e.shiftKey)}>
              {label}
            </button>
          ) : (
            <span key={i} role="columnheader" className="db-grid-col" style={{ gridColumn: i + 2 }} aria-colindex={i + 1} title={`${c.type ? `${c.name}（${c.type}）` : c.name}${keyNote ? ` ${keyNote}` : ""}`}>
              {label}
            </span>
          );
        })}
      </div>
      <div className="db-grid-body" style={{ height: rows.length * ROW_HEIGHT }}>
        {rows.slice(first, last).map((row, i) => {
          const index = first + i;
          const rowState = edit?.rowState(index) ?? null;
          return (
            <div key={index} className={cx("db-grid-row", rowState && `db-row-${rowState}`)} role="row" style={{ top: index * ROW_HEIGHT }}>
              <span className="db-grid-index" style={INDEX_PLACE}>{rowState === "added" ? "＋" : rowOffset + index + 1}</span>
              {shownCols.map((col) => {
                const value = row[col] ?? null;
                const state = edit?.cellState(index, col) ?? null;
                const text = state === "default" ? "既定値" : cellText(value);
                return (
                  <span
                    key={col}
                    role="gridcell"
                    aria-colindex={col + 1}
                    style={{ gridColumn: col + 2 }}
                    className={cx(
                      "db-grid-cell",
                      state === "default" ? "db-cell-default" : `db-cell-${cellKind(value)}`,
                      state === "changed" && "db-cell-changed",
                      picked?.row === index && picked.col === col && "picked",
                    )}
                    title={text.length > 20 ? text : undefined}
                    onMouseDown={() => setPicked({ row: index, col })}
                    onDoubleClick={edit ? () => startEdit(index, col) : undefined}
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
        {editing && (
          <textarea
            className="db-grid-editor"
            style={{ top: editing.row * ROW_HEIGHT, left: INDEX_WIDTH + editing.col * COLUMN_WIDTH, minWidth: COLUMN_WIDTH, maxWidth: COLUMN_WIDTH * 3 }}
            aria-label={`${columns[editing.col]?.name ?? ""} を書き直す`}
            value={editing.text}
            rows={1}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const text = e.target.value;
              setEditing((v) => v && { ...v, text });
            }}
            onBlur={() => finishEdit(true, false)}
            onKeyDown={(e) => {
              if (isSubmitKey(e) && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                finishEdit(true, true);
              } else if (isCancelKey(e)) {
                // パネルを閉じる Esc などに渡さない
                e.preventDefault();
                e.stopPropagation();
                finishEdit(false, true);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
