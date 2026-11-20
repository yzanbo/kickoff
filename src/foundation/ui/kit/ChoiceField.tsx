import type { ReactNode } from "react";
import { Field } from "./Field";
import { Segmented, type SegmentOption } from "./Segmented";

/** 名前つきの欄の中で 1 つを選ぶ（Field ＋ Segmented の切り替え。名前は 1 回書けば読み上げにも使う） */
export function ChoiceField<T extends string>({
  label,
  help,
  value,
  options,
  onChange,
}: {
  label: string;
  help?: ReactNode;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label} help={help} as="div">
      <Segmented label={label} value={value} options={options} onChange={onChange} />
    </Field>
  );
}

/** する・しないの 2 択（value={x ? "on" : "off"} を手で書かない。左がオン） */
export function SwitchField({
  label,
  help,
  checked,
  onChange,
  onLabel,
  offLabel,
}: {
  label: string;
  help?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <ChoiceField
      label={label}
      help={help}
      value={checked ? "on" : "off"}
      options={[
        { value: "on", label: onLabel },
        { value: "off", label: offLabel },
      ]}
      onChange={(v) => onChange(v === "on")}
    />
  );
}
