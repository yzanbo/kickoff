import { Bot, History } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { DbConnection, DbQueryHistoryEntry } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { formatFullStamp, shortRelativeTime } from "@/lib/time";
import { ErrorText } from "@/ui/ErrorText";
import { Popover } from "@/ui/Popover";
import { SearchField } from "@/ui/SearchField";
import { chatTitle } from "@/features/chat/chatTitle";
import { useDbClient } from "./dbClientContext";

/** 履歴の 1 行の結果の文（行数・時間、失敗なら失敗の文） */
function resultText(e: DbQueryHistoryEntry): string {
  const ms = e.duration_ms !== null ? `${e.duration_ms.toLocaleString()} ms` : null;
  const rows = e.row_count !== null ? `${e.row_count.toLocaleString()} 行` : null;
  return [rows, ms].filter(Boolean).join(" · ");
}

/**
 * SQL のタブの「履歴」: この接続で流した SQL（利用者と AI。新しい順に 200 件。表は接続ごとに 500 件）を開いて探し、押すと入力欄の終わりに足して選ぶ（⌘↵ でそのまま流せる）。
 * AI が流したものは印とチャットの名前を添える
 */
export function SqlHistoryButton({ connection, onPick }: { connection: DbConnection; onPick: (sql: string) => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="btn btn-sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-tip="この接続で流した SQL（AI が流したものも）を探して入力欄に入れる"
      >
        <History size={13} aria-hidden /> 履歴
      </button>
      {open && (
        <Popover anchor={anchor} align="start" label="SQL の履歴" title="SQL の履歴" className="db-sql-history" onClose={() => setOpen(false)}>
          <SqlHistoryList
            connection={connection}
            onPick={(sql) => {
              setOpen(false);
              onPick(sql);
            }}
          />
        </Popover>
      )}
    </>
  );
}

function SqlHistoryList({ connection, onPick }: { connection: DbConnection; onPick: (sql: string) => void }) {
  const client = useDbClient();
  const [query, setQuery] = useState("");
  const history = useAsync(() => api.dbHistory(client.projectId, connection.id), [client.projectId, connection.id]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = history.data ?? [];
    return needle ? list.filter((e) => e.sql.toLowerCase().includes(needle) || (e.chat_title ?? "").toLowerCase().includes(needle)) : list;
  }, [history.data, query]);

  return (
    <div className="db-sql-history-body">
      <SearchField value={query} onChange={setQuery} placeholder="SQL・チャットの名前で絞り込む" label="履歴を絞り込む" autoFocus />
      <ErrorText message={history.error} />
      {history.loading && !history.data && <p className="small muted">読み込み中…</p>}
      {history.data && shown.length === 0 && <p className="small muted">{query.trim() ? "当てはまる SQL はありません。" : "まだ SQL を流していません。"}</p>}
      <ul className="db-sql-history-list">
        {shown.map((e) => (
          <li key={e.id}>
            <button type="button" className="db-sql-history-row" onClick={() => onPick(e.sql)} title={e.sql}>
              <code className="db-sql-history-sql">{e.sql}</code>
              <span className="db-sql-history-meta small">
                {e.ran_by === "ai" && (
                  <span className="db-sql-history-ai" data-tip={e.chat_title !== null ? `チャット「${chatTitle(e.chat_title)}」の AI が流しました` : "チャットの AI が流しました（チャットは消えています）"}>
                    <Bot size={11} aria-hidden /> AI{e.chat_title !== null && ` · ${chatTitle(e.chat_title)}`}
                  </span>
                )}
                <span className="muted" data-tip={formatFullStamp(e.ran_at)}>
                  {shortRelativeTime(e.ran_at)}
                </span>
                {e.error !== null ? <span className="db-sql-history-error">{e.error}</span> : <span className="muted">{resultText(e)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
