import { FileUp } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "@shared/errors";
import { DB_EDITS_MAX, type DbEditValue } from "@shared/types";
import { useModalDialog } from "@/hooks/useModalDialog";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { CheckField } from "@/ui/Field";
import { CSV_DELIMITER_LABELS, CSV_DELIMITERS, detectDelimiter, mapCsvRows, parseDelimited, type CsvDelimiter } from "./csvImport";
import { cellText } from "./dbFormat";

/** 読み込むファイルの大きさの上限 */
const CSV_MAX_BYTES = 20 * 1024 * 1024;
/** 見本に出す行の数 */
const PREVIEW_ROWS = 5;

/**
 * CSV・TSV を取り込むダイアログ: ファイルを選ぶか貼り付け、区切り（初めは 1 行目から推す）・1 行目は列の名前か・空のセルを NULL にするかを選び、
 * テーブルの列への当て方と頭の数行を見てから、足す行として読み込む（保存するまで DB は変えない）。room: あと足せる変更の数
 */
export function CsvImportDialog({
  table,
  columns,
  room,
  onImport,
  onClose,
}: {
  table: string;
  columns: string[];
  room: number;
  onImport: (rows: Record<string, DbEditValue>[]) => void;
  onClose: () => void;
}) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [delimiter, setDelimiter] = useState<CsvDelimiter | "auto">("auto");
  const [header, setHeader] = useState(true);
  const [emptyAsNull, setEmptyAsNull] = useState(true);
  const [error, setError] = useState<string>();

  const used = delimiter === "auto" ? detectDelimiter(text) : delimiter;
  const mapped = useMemo(() => (text ? mapCsvRows(parseDelimited(text, used), columns, header, emptyAsNull) : null), [text, used, columns, header, emptyAsNull]);
  const targets = mapped?.mapping.filter((c): c is string => c !== null) ?? [];
  const count = mapped?.rows.length ?? 0;
  const over = count > room;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(undefined);
    if (f.size > CSV_MAX_BYTES) return setError(`${Math.round(CSV_MAX_BYTES / 1024 / 1024)} MB より大きいファイルは読み込めません`);
    try {
      setText(await f.text());
      setSource(f.name);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mapped || count === 0 || over || targets.length === 0) return;
    onImport(mapped.rows);
    dialog.close();
  };

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog db-csv-dialog" aria-label="CSV を取り込む" onClose={onClose}>
      <form className="app-dialog-body" onSubmit={submit}>
        <h2 className="app-dialog-title">{table} に CSV を取り込む</h2>
        <p className="muted small">読み込んだ行は、足す行として表に並びます。中身を確かめてから「保存」で DB に入れます。入れない列は DB の既定値になります。</p>
        <div className="db-csv-source">
          <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>
            <FileUp size={12} aria-hidden /> ファイルを選ぶ…
          </button>
          <span className="small muted">{source ?? "か、下に貼り付け"}</span>
          <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
        <textarea
          className="db-csv-text"
          value={text}
          placeholder={"id,name\n1,Alice"}
          spellCheck={false}
          aria-label="CSV の中身"
          onChange={(e) => {
            setText(e.target.value);
            setSource(null);
          }}
        />
        <div className="db-csv-options small">
          <label>
            区切り
            <select value={delimiter} onChange={(e) => setDelimiter(e.target.value as CsvDelimiter | "auto")}>
              <option value="auto">自動（{CSV_DELIMITER_LABELS[detectDelimiter(text)]}）</option>
              {CSV_DELIMITERS.map((d) => (
                <option key={d} value={d}>
                  {CSV_DELIMITER_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <CheckField label="1 行目は列の名前" checked={header} onChange={setHeader} />
          <CheckField label="空のセルは NULL にする" checked={emptyAsNull} onChange={setEmptyAsNull} />
        </div>
        {mapped && (
          <div className="db-csv-preview small">
            <p>
              {count.toLocaleString()} 行 · 入れる列: {targets.length > 0 ? targets.join(", ") : "なし"}
              {mapped.unknown.length > 0 && <span className="muted">（テーブルにない列は読みません: {mapped.unknown.join(", ")}）</span>}
            </p>
            {targets.length === 0 && <p className="error">{header ? "1 行目の見出しに、テーブルの列の名前がありません" : "入れる列がありません"}</p>}
            {over && <p className="error">あと {room.toLocaleString()} 行まで足せます（1 回に保存できる変更は {DB_EDITS_MAX.toLocaleString()} 件まで）</p>}
            {targets.length > 0 && count > 0 && (
              <div className="db-csv-table">
                <table>
                  <thead>
                    <tr>
                      {targets.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                      <tr key={i}>
                        {targets.map((c) => (
                          <td key={c} className={r[c] === null ? "muted" : undefined}>
                            {cellText(r[c] ?? null)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <ErrorText message={error} />
        <DialogActions onCancel={() => dialog.close()} submit={{ label: count > 0 ? `${count.toLocaleString()} 行を足す` : "足す", disabled: count === 0 || over || targets.length === 0 }} />
      </form>
    </dialog>
  );
}
