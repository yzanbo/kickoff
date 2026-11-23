import type { ReactNode } from "react";
import { CheckField, Field } from "@/foundation/ui/kit/Field";

/**
 * パスワードの欄（保存してあれば伏せ字を placeholder に出し、変えるときだけ入れる）。
 * onClear を渡すと、保存してあるときに「保存した…を消す」を下に出す（消す間は欄を使えない）
 */
export function SecretField({
  label,
  help,
  saved,
  value,
  clear,
  clearLabel,
  disabled = false,
  onChange,
  onClear,
}: {
  label: string;
  help?: ReactNode;
  saved: boolean;
  value: string;
  clear: boolean;
  clearLabel?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onClear?: (clear: boolean) => void;
}) {
  return (
    <>
      <Field label={label} help={help}>
        <input type="password" value={value} onChange={(e) => onChange(e.target.value)} disabled={clear || disabled} autoComplete="new-password" placeholder={saved ? "••••••••" : ""} />
      </Field>
      {saved && onClear && clearLabel && <CheckField label={clearLabel} checked={clear} onChange={onClear} />}
    </>
  );
}
