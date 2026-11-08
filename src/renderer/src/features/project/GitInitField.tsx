import type { ReactNode } from "react";
import { Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";

type Choice = "on" | "off";

/**
 * 新しいプロジェクトのダイアログの「git の管理」の欄: 始める / 始めないのボタンの組と、選んだ方の説明（新しく作る・既存のフォルダの取り込みで共通）。
 * managed を渡すと（もう git で管理されているフォルダ）、ボタンの代わりにその旨を出す
 */
export function GitInitField({
  on,
  off,
  value,
  onChange,
  help,
  managed,
}: {
  /** 始める方・始めない方のボタンの名前 */
  on: string;
  off: string;
  value: boolean;
  onChange: (value: boolean) => void;
  help?: ReactNode;
  /** もう git で管理されているときの案内（あればボタンを出さない） */
  managed?: string | null;
}) {
  if (managed) {
    return (
      <Field as="div" label="git の管理">
        <p className="git-init-managed">
          <span className="git-init-managed-icon" aria-hidden>
            ✓
          </span>
          <span>{managed}</span>
        </p>
      </Field>
    );
  }
  return (
    <Field as="div" label="git の管理" help={help}>
      <Segmented<Choice>
        className="segmented git-init-choice"
        label="git の管理"
        value={value ? "on" : "off"}
        onChange={(next) => onChange(next === "on")}
        options={[
          { value: "on", label: on },
          { value: "off", label: off },
        ]}
      />
    </Field>
  );
}
