import { useEffect, useState } from "react";
import { useSave } from "@/hooks/useSave";
import { ErrorText } from "@/ui/ErrorText";
import { Field } from "@/ui/Field";

/**
 * メモのフォルダの指定（設定の親フォルダ・プロジェクトごとの別の場所で共通）。空なら fallback（既定）を使う。
 * 「選択…」で Finder から選べる（アプリだけ）。保存は「保存」で、「既定に戻す」で null にする
 */
export function MemoFolderField({
  label,
  help,
  value,
  fallback,
  onSave,
}: {
  label: string;
  help: string;
  /** いまの指定（null なら既定） */
  value: string | null;
  /** 指定していないときに使う場所（入力欄の薄い文字） */
  fallback: string;
  onSave: (next: string | null) => Promise<unknown>;
}) {
  const [typed, setTyped] = useState(value ?? "");
  const save = useSave();
  // ほかで変わったら（保存したあとの知らせ・ほかのウィンドウ）、入力欄もそろえる
  useEffect(() => setTyped(value ?? ""), [value]);
  const next = typed.trim() || null;

  return (
    <Field as="div" label={label} help={help}>
      <div className="input-row">
        <input type="text" aria-label={label} value={typed} placeholder={fallback} onChange={(e) => setTyped(e.target.value)} />
        {window.kickoff && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const picked = await window.kickoff?.dialog.pickFolder(label);
              if (picked) setTyped(picked);
            }}
          >
            選択…
          </button>
        )}
      </div>
      <div className="memo-folder-actions">
        <button className="btn btn-primary btn-sm" disabled={next === value || save.saving} onClick={() => void save.run(() => onSave(next))}>
          {save.saving ? "保存中…" : "保存"}
        </button>
        {value !== null && (
          <button className="btn btn-sm" disabled={save.saving} onClick={() => void save.run(() => onSave(null))}>
            既定に戻す
          </button>
        )}
        {save.message && !save.error && <span className="muted small">{save.message.text}</span>}
      </div>
      <ErrorText message={save.error} />
    </Field>
  );
}
