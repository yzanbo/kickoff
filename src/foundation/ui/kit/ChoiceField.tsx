import type { ReactNode } from "react";
import { Field } from "./Field";
import { Segmented, type SegmentOption } from "./Segmented";

interface FieldText {
  label: string;
  /** 読み上げの組の名前が欄の名前と違うとき（「下の帯」の組を「下の帯の出し方」と読むなど。省けば label） */
  groupLabel?: string;
  help?: ReactNode;
}

/** 名前つきの欄の中で 1 つを選ぶ（Field ＋ Segmented の切り替え。名前は 1 回書けば読み上げにも使う） */
export function ChoiceField<T extends string>({
  label,
  groupLabel,
  help,
  value,
  options,
  onChange,
}: FieldText & {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label} help={help} as="div">
      <Segmented label={groupLabel ?? label} value={value} options={options} onChange={onChange} />
    </Field>
  );
}

/** する・しないの 2 択（value={x ? "on" : "off"} を手で書かない。左がオン） */
export function SwitchField({
  checked,
  onChange,
  onLabel,
  offLabel,
  ...text
}: FieldText & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <ChoiceField
      {...text}
      value={checked ? "on" : "off"}
      options={[
        { value: "on", label: onLabel },
        { value: "off", label: offLabel },
      ]}
      onChange={(v) => onChange(v === "on")}
    />
  );
}
