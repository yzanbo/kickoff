import type { ReactNode, Ref } from "react";
import { cx } from "@/lib/cx";

/**
 * ダイアログ・フォームの下のボタンの行。既定は右に寄せ（入りきらなければ折り返す）、左から「キャンセル」（onCancel を渡したとき）・
 * 実行のボタン（children）・フォームを送るボタン（submit。いちばんおすすめの色で、送っている間は busyLabel にして押せなくする）を並べる。
 * align="start" は左に寄せる（設定の保存のボタンと結果の文。SaveActions）
 */
export function DialogActions({
  onCancel,
  cancelRef,
  submit,
  align = "end",
  className,
  children,
}: {
  onCancel?: () => void;
  /** キャンセルのボタン（開いたときにピントを置くなど） */
  cancelRef?: Ref<HTMLButtonElement>;
  submit?: { label: string; busyLabel?: string; busy?: boolean; disabled?: boolean };
  align?: "start" | "end";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("dialog-actions", align === "start" && "start", className)}>
      {onCancel && (
        <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>
          キャンセル
        </button>
      )}
      {children}
      {submit && (
        <button type="submit" className="btn btn-primary" disabled={submit.busy || submit.disabled}>
          {submit.busy ? (submit.busyLabel ?? submit.label) : submit.label}
        </button>
      )}
    </div>
  );
}
