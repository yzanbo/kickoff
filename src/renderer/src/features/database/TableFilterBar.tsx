import { Filter, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DB_FILTER_OP_LABELS, DB_FILTER_OPS, type DbFilter, type DbFilterOp, type DbRowFilter } from "@shared/types";
import { activeFilters, filterNeedsValue } from "@shared/database/dbFilter";
import { isSubmitKey } from "@/lib/keys";
import { IconButton } from "@/ui/IconButton";
import { Segmented } from "@/ui/Segmented";

type Mode = "conditions" | "where";
const MODES: { value: Mode; label: string }[] = [
  { value: "conditions", label: "条件" },
  { value: "where", label: "WHERE を書く" },
];

const blank = (column: string): DbFilter => ({ column, op: "eq", value: "" });

/**
 * テーブルのデータの絞り込みの帯: 条件（列 ▾・演算子 ▾・値。「＋ 条件」で足し、すべてを満たす行）か、WHERE の文を書く。
 * 書いている間は下書きで、「絞る」か Enter で当てる（applied はタブに覚えた、いま当てている絞り込み）
 */
export function TableFilterBar({ columns, applied, onApply }: { columns: string[]; applied: DbRowFilter | undefined; onApply: (filter: DbRowFilter | null) => void }) {
  const [mode, setMode] = useState<Mode>(applied?.where ? "where" : "conditions");
  const [rows, setRows] = useState<DbFilter[]>(() => (applied?.filters.length ? applied.filters : [blank(columns[0] ?? "")]));
  const [where, setWhere] = useState(applied?.where ?? "");
  // ほかから絞り込みが変わったら（セルの「この値で絞る」・外部キーで移った）下書きを合わせる
  const appliedKey = JSON.stringify(applied ?? null);
  useEffect(() => {
    setMode(applied?.where ? "where" : "conditions");
    setRows(applied?.filters.length ? applied.filters : [blank(columns[0] ?? "")]);
    setWhere(applied?.where ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);
  // 列が届いたら、まだ列を選んでいない行に最初の列を入れる
  useEffect(() => {
    if (columns.length > 0) setRows((rs) => rs.map((r) => (r.column ? r : { ...r, column: columns[0] })));
  }, [columns]);

  const apply = () => {
    if (mode === "where") return onApply(where.trim() ? { filters: [], where: where.trim() } : null);
    const filters = activeFilters(rows);
    onApply(filters.length > 0 ? { filters, where: null } : null);
  };
  const update = (i: number, patch: Partial<DbFilter>) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const onKey = (e: React.KeyboardEvent) => {
    if (isSubmitKey(e)) {
      e.preventDefault();
      apply();
    }
  };
  const active = Boolean(applied);

  return (
    <div className="db-filter-bar">
      <Segmented className="segmented db-filter-mode" label="絞り込みの書き方" value={mode} options={MODES} onChange={setMode} />
      {mode === "where" ? (
        <label className="db-filter-where">
          <span className="db-filter-where-head">WHERE</span>
          <input type="text" value={where} placeholder="例: price > 100 AND name LIKE '%a%'" spellCheck={false} onChange={(e) => setWhere(e.target.value)} onKeyDown={onKey} aria-label="WHERE の式" />
        </label>
      ) : (
        <div className="db-filter-rows">
          {rows.map((r, i) => (
            <div key={i} className="db-filter-row">
              <select value={r.column} onChange={(e) => update(i, { column: e.target.value })} aria-label="列">
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select value={r.op} onChange={(e) => update(i, { op: e.target.value as DbFilterOp })} aria-label="比べ方">
                {DB_FILTER_OPS.map((op) => (
                  <option key={op} value={op}>
                    {DB_FILTER_OP_LABELS[op]}
                  </option>
                ))}
              </select>
              {filterNeedsValue(r.op) && <input type="text" value={r.value} placeholder="値" spellCheck={false} onChange={(e) => update(i, { value: e.target.value })} onKeyDown={onKey} aria-label="値" />}
              {rows.length > 1 && <IconButton icon={X} size={12} label="この条件を外す" onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))} />}
            </div>
          ))}
          <button type="button" className="link-button small" onClick={() => setRows((rs) => [...rs, blank(columns[0] ?? "")])}>
            <Plus size={12} aria-hidden /> 条件
          </button>
        </div>
      )}
      <span className="db-filter-actions">
        <button type="button" className="btn btn-sm btn-primary" onClick={apply} data-tip="この絞り込みで取り直す" data-tip-keys="Enter">
          <Filter size={12} aria-hidden /> 絞る
        </button>
        {active && (
          <button type="button" className="btn btn-sm" onClick={() => onApply(null)}>
            絞り込みを外す
          </button>
        )}
      </span>
    </div>
  );
}
