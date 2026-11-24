import { cx } from "@/foundation/ui/lib/cx";
import type { ActionState, ResultText } from "@/foundation/ui/hooks/useAction";
import { DialogActions } from "./DialogActions";

/** 結果の文（成功は success、失敗は error の色） */
export function ResultMessage({ result, as: Tag = "span", className }: { result: ResultText | undefined; as?: "span" | "p"; className?: string }) {
  if (!result) return null;
  return <Tag className={cx(className, result.kind === "ok" ? "success" : "error")}>{result.text}</Tag>;
}

/** フォームの下の保存ボタンと結果（保存中…・保存しました・失敗の理由。save は useAction<"save">()） */
export function SaveActions({ save, disabled, onSave }: { save: ActionState<"save">; disabled?: boolean; onSave: () => Promise<unknown> }) {
  const saving = save.busy !== null;
  return (
    <DialogActions align="start">
      <button className="btn btn-primary" disabled={disabled || saving} onClick={() => void save.run("save", onSave, { done: "保存しました" })}>
        {saving ? "保存中…" : "保存"}
      </button>
      <ResultMessage result={save.result} />
    </DialogActions>
  );
}
