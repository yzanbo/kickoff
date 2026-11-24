import "./NoteFolderField.css";
import { useEffect, useRef, useState } from "react";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { Field } from "@/foundation/ui/kit/Field";
import { NoteOverlapNotice } from "./NoteOverlapNotice";
import { canPickFolder, pickFolder } from "@/features/notes/ui/native";

/**
 * ノートのフォルダの指定（設定の親フォルダ・プロジェクトごとの別の場所で共通）。空なら fallback（既定）を使う。
 * 「選択…」で Finder から選べる（アプリだけ）。保存は「保存」で、「既定に戻す」で null にする
 */
export function NoteFolderField({
  label,
  help,
  value,
  fallback,
  onSave,
  overlapExcept,
}: {
  label: string;
  help: string;
  /** いまの指定（null なら既定） */
  value: string | null;
  /** 指定していないときに使う場所（入力欄の薄い文字） */
  fallback: string;
  onSave: (next: string | null) => Promise<unknown>;
  /** ほかのプロジェクトとノートフォルダが同じなら知らせる（このプロジェクトの ID。プロジェクトごとの別の場所だけ。設定の親フォルダは渡さない） */
  overlapExcept?: number;
}) {
  const [typed, setTyped] = useState(value ?? "");
  const save = useAction<"save">();
  /** 断られた保存の、打った値と戻る先の値（saveSettings は先に店へ入れ、断られると読み直して戻すので、戻ったときに入力欄を空にしない） */
  const rejected = useRef<{ typed: string; revertTo: string | null } | null>(null);
  const latest = useRef(value);
  // ほかで変わったら（保存したあとの知らせ・ほかのウィンドウ）、入力欄もそろえる。断られて前の値へ戻っただけなら、打った値を残す
  useEffect(() => {
    latest.current = value;
    const kept = rejected.current;
    rejected.current = null;
    setTyped(kept && kept.revertTo === value ? kept.typed : (value ?? ""));
  }, [value]);
  const next = typed.trim() || null;
  const submit = (target: string | null) =>
    save.run(
      "save",
      async () => {
        const attempt = typed;
        const before = value;
        try {
          await onSave(target);
        } catch (e) {
          setTyped(attempt);
          // まだ戻っていなければ、戻ったときにも打った値を残す
          if (latest.current !== before) rejected.current = { typed: attempt, revertTo: before };
          throw e;
        }
      },
      { done: "保存しました" },
    );

  return (
    <Field as="div" label={label} help={help}>
      <div className="input-row">
        <input type="text" aria-label={label} value={typed} placeholder={fallback} onChange={(e) => setTyped(e.target.value)} />
        {canPickFolder() && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const picked = await pickFolder(label);
              if (picked) setTyped(picked);
            }}
          >
            選択…
          </button>
        )}
      </div>
      {overlapExcept !== undefined && <NoteOverlapNotice dir={typed.trim() || fallback} except={overlapExcept} />}
      <div className="note-folder-actions">
        <button className="btn btn-primary" data-size="sm" disabled={next === value || save.busy !== null} onClick={() => void submit(next)}>
          {save.busy !== null ? "保存中…" : "保存"}
        </button>
        {value !== null && (
          <button className="btn" data-size="sm" disabled={save.busy !== null} onClick={() => void submit(null)}>
            既定に戻す
          </button>
        )}
        {save.result && !save.error && <span className="muted small">{save.result.text}</span>}
      </div>
      <ErrorText message={save.error} />
    </Field>
  );
}
