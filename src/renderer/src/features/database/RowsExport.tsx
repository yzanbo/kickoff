// 読み込んだ行の「書き出す」（CSV / TSV / JSON のファイル）と「コピー」（同じ形でクリップボードへ）。SQL のタブの結果とテーブルのタブの下の帯で共通
import { Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import type { DbColumnInfo, DbValue } from "@shared/types";
import { downloadText } from "@/lib/download";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { DB_EXPORT_FORMATS, DB_EXPORT_TYPES, exportRows, type DbExportFormat } from "./dbRowTools";

/** コピーしたことを見せておく時間 */
const COPIED_MS = 1500;

/**
 * 2 つのボタンと形を選ぶメニュー。rows は押したときに読む行（テーブルのタブは、頭だけの長い文字の残りを読んでから渡す）。
 * fileName は書き出すファイルの名前（拡張子なし）
 */
export function RowsExport({ fileName, count, columns, rows }: { fileName: string; count: number; columns: DbColumnInfo[]; rows: () => Promise<DbValue[][]> }) {
  const menu = useContextMenu<"download" | "copy">();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const run = async (how: "download" | "copy", format: DbExportFormat) => {
    const text = exportRows(columns, await rows(), format);
    if (how === "download") downloadText(`${fileName}.${format}`, text, DB_EXPORT_TYPES[format]);
    else await navigator.clipboard.writeText(text).then(() => setCopied(true), reportFailure("コピーできませんでした"));
  };
  const open = menu.menu;
  return (
    <>
      <button type="button" className="btn btn-sm" disabled={count === 0} onClick={(e) => menu.toggle(e, "download")} aria-haspopup="menu" data-tip="読み込んだ行をファイルに書き出す">
        <Download size={12} aria-hidden /> 書き出す
      </button>
      <button type="button" className="btn btn-sm" disabled={count === 0} onClick={(e) => menu.toggle(e, "copy")} aria-haspopup="menu" data-tip="読み込んだ行をクリップボードに写す（TSV なら表計算に貼れる）">
        <Copy size={12} aria-hidden /> {copied ? "コピーしました" : "コピー"}
      </button>
      {open && (
        <PopupMenu at={open.at} label={open.value === "download" ? "書き出す形" : "コピーする形"} onClose={menu.close}>
          {DB_EXPORT_FORMATS.map((f) => (
            <MenuItem key={f} onSelect={() => void run(open.value, f)}>
              {f.toUpperCase()}（読み込んだ {count.toLocaleString()} 行）
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </>
  );
}
