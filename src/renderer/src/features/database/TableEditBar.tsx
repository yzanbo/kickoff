import { FileUp, Plus, Save, Undo2 } from "lucide-react";
import type { DbConnection } from "@shared/types";
import { ErrorText } from "@/ui/ErrorText";
import type { TableEditsState } from "./useTableEdits";

/**
 * テーブルのデータの上の編集の帯: 「＋ 行を足す」「CSV を取り込む…」・保存していない変更の数・「取り消す」「保存（⌘S）」。
 * 読み取り専用の接続は「書き込む…」を押すまで書き換えられない。ビューと、行を指すキーのないテーブルは、そう添える
 */
export function TableEditBar({ state, connection, onAddRow, onImportCsv }: { state: TableEditsState; connection: DbConnection; onAddRow: () => void; onImportCsv: () => void }) {
  const { counts, writable, isTable, keyColumns, write, saving } = state;
  const parts = [
    counts.updates > 0 && `書き換え ${counts.updates.toLocaleString()} 行`,
    counts.inserts > 0 && `追加 ${counts.inserts.toLocaleString()} 行`,
    counts.deletes > 0 && `削除 ${counts.deletes.toLocaleString()} 行`,
  ].filter(Boolean);
  return (
    <>
      <div className="db-edit-bar small">
        {isTable && (
          <>
            <button type="button" className="btn btn-sm" disabled={!writable} onClick={onAddRow} data-tip="下に新しい行を足す（入れない列は DB の既定値）">
              <Plus size={12} aria-hidden /> 行を足す
            </button>
            <button type="button" className="btn btn-sm" disabled={!writable} onClick={onImportCsv} data-tip="CSV・TSV の行を、足す行として読み込む（保存するまで DB は変えません）">
              <FileUp size={12} aria-hidden /> CSV を取り込む…
            </button>
          </>
        )}
        {!isTable ? (
          <span className="muted">ビューは書き換えられません</span>
        ) : (
          !keyColumns && <span className="muted">主キー（か NULL を許さない一意の列）がないので、行を足すことだけできます</span>
        )}
        {isTable && connection.read_only && !write.on && (
          <>
            <span className="db-sql-readonly">読み取り専用</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void write.start()}
              data-tip="このタブだけ読み取り専用を外し、セルを書き換えられるようにする（環境の名前を入れて確かめます。接続の設定は変えません）"
            >
              書き込む…
            </button>
          </>
        )}
        <span className="db-edit-spacer" />
        {parts.length > 0 && (
          <>
            <span className="db-edit-count">保存していない変更: {parts.join("・")}</span>
            <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void state.discard()} data-tip="保存していない変更をすべて捨てる">
              <Undo2 size={12} aria-hidden /> 取り消す
            </button>
            <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={() => void state.save()} data-tip="流す SQL を見せて確かめてから、まとめて保存する" data-tip-keys="⌘S">
              <Save size={12} aria-hidden /> {saving ? "保存中…" : "保存"}
            </button>
          </>
        )}
      </div>
      <ErrorText message={state.error} className="db-table-error" />
    </>
  );
}
