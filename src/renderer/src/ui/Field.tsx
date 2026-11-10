import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * 入力欄の 1 行（名前・入力・補足）。入力欄が 1 つなら label（名前を押すとその欄にピントが入る）、
 * ボタンや入力欄がいくつも並ぶ・選択肢の一覧などは as="div"（label で包むと、名前を押したときに最初のものが押される）
 */
export function Field({
  label,
  help,
  as: Tag = "label",
  labelClassName,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  as?: "label" | "div";
  /** 名前の行に加えるクラス（名前の横にボタンを並べるときなど） */
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <Tag className="field">
      {/* label が null なら名前の行を出さない（まわりの見出しが名前を兼ねるとき） */}
      {label !== null && <span className={cx("field-label", labelClassName)}>{label}</span>}
      {children}
      {help && <span className="field-help">{help}</span>}
    </Tag>
  );
}

/** 説明付きのチェック（名前の下に小さな説明）。押すたびに onChange にチェックしたかを渡す */
export function CheckField({
  label,
  help,
  checked,
  disabled,
  className,
  onChange,
}: {
  label: ReactNode;
  help?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cx("check", className)}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {help && <span className="field-help">{help}</span>}
      </span>
    </label>
  );
}
