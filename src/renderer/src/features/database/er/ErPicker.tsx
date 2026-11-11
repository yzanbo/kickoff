import { useMemo, useState } from "react";
import { DB_ER_MAX } from "@shared/types";
import { SearchField } from "@/ui/SearchField";

/**
 * 描くテーブルを選ぶ一覧（テーブルの多い DB で初めに出す・道具の行の「テーブルを選ぶ」）。
 * 名前で絞り込み、見えているものをまとめて選べる。DB_ER_MAX 個まで
 */
export function ErPicker({ names, initial, onPick, onAll }: { names: string[]; initial: string[]; onPick: (names: string[]) => void; onAll: (() => void) | null }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(initial));
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? names.filter((n) => n.toLowerCase().includes(needle)) : names;
  }, [names, query]);
  const toggle = (name: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const over = picked.size > DB_ER_MAX;

  return (
    <div className="db-er-picker">
      <SearchField value={query} onChange={setQuery} placeholder="テーブルの名前で絞り込む" label="テーブルを絞り込む" autoFocus />
      <div className="db-er-picker-bulk small">
        <button type="button" className="link-button" onClick={() => setPicked((s) => new Set([...s, ...shown]))}>
          見えているものを選ぶ
        </button>
        <button type="button" className="link-button" onClick={() => setPicked((s) => new Set([...s].filter((n) => !shown.includes(n))))}>
          見えているものを外す
        </button>
        <span className="muted">
          {picked.size.toLocaleString()} / {names.length.toLocaleString()} 個
        </span>
      </div>
      <ul className="db-er-picker-list">
        {shown.map((n) => (
          <li key={n}>
            <label className="db-er-picker-row">
              <input type="checkbox" checked={picked.has(n)} onChange={() => toggle(n)} />
              <span>{n}</span>
            </label>
          </li>
        ))}
      </ul>
      {over && <p className="small db-er-picker-over">一度に描けるのは {DB_ER_MAX} 個までです。</p>}
      <div className="db-er-picker-actions">
        {onAll && (
          <button type="button" className="btn btn-sm" onClick={onAll}>
            すべて描く
          </button>
        )}
        <button type="button" className="btn btn-sm btn-primary" disabled={picked.size === 0 || over} onClick={() => onPick(names.filter((n) => picked.has(n)))}>
          選んだ {picked.size.toLocaleString()} 個を描く
        </button>
      </div>
    </div>
  );
}
