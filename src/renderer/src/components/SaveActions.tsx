import { cx } from "../cx";
import type { ResultText, SaveState } from "../hooks/useSave";

/** 結果の文（成功は success、失敗は error の色） */
export function ResultMessage({ result, as: Tag = "span", className }: { result: ResultText | undefined; as?: "span" | "p"; className?: string }) {
  if (!result) return null;
  return <Tag className={cx(className, result.kind === "ok" ? "success" : "error")}>{result.text}</Tag>;
}

/** フォームの下の保存ボタンと結果（保存中…・保存しました・失敗の理由） */
export function SaveActions({ save, disabled, onSave }: { save: SaveState; disabled?: boolean; onSave: () => Promise<unknown> }) {
  return (
    <div className="form-actions">
      <button className="btn btn-primary" disabled={disabled || save.saving} onClick={() => void save.run(onSave)}>
        {save.saving ? "保存中…" : "保存"}
      </button>
      <ResultMessage result={save.message} />
    </div>
  );
}
