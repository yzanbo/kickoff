import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ChoiceField } from "@/foundation/ui/kit/ChoiceField";
import { HeadMenu, HeadToggle } from "./HeadMenu";
import { choiceMeta, fieldEnabled, patchOf, viewField, type SidebarViewState, type TunerContext, type ViewKey } from "./viewFields";

type Value = string | boolean;
/** 設定の画面の選ぶ欄の値（オン・オフは on / off） */
const keyOf = (v: Value) => (v === true ? "on" : v === false ? "off" : v);

interface Props {
  field: ViewKey;
  state: SidebarViewState;
  set(patch: Partial<SidebarViewState>): void;
}

/**
 * ⚙ の窓の 1 つの項目のボタン。選択肢が 3 つ以上ならメニュー（HeadMenu）、2 つなら押すたびに切り替え（HeadToggle）。
 * 選べない形（要対応がオフなど）のときは押せなくする（隠さず薄くする）
 */
export function TunerFieldButton({ field, state, set, ctx, extra }: Props & { ctx: TunerContext; extra?: ReactNode }) {
  const f = viewField(field);
  const value = state[field];
  const meta = choiceMeta(field, value);
  const values = f.choices.map((c) => choiceMeta(field, c).short);
  const disabled = f.enabledWhen ? !fieldEnabled(field, state) : undefined;
  const common = { id: f.head.id, icon: meta.icon, label: f.head.label, value: meta.short, title: f.head.title(value, ctx), disabled };
  if (f.head.menu) {
    const choices = f.choices as readonly string[];
    const menuMeta = Object.fromEntries(choices.map((c) => [c, { icon: choiceMeta(field, c).icon, label: choiceMeta(field, c).label ?? "" }])) as Record<string, { icon: LucideIcon; label: string }>;
    return <HeadMenu {...common} values={values} extra={extra} menu={{ title: f.head.menu, choices, meta: menuMeta, current: value as string, onPick: (c) => set(patchOf(field, c)) }} />;
  }
  return (
    <HeadToggle
      {...common}
      values={values as [string, string]}
      pressed={f.head.pressed ? (value as boolean) : undefined}
      onToggle={() => set(patchOf(field, f.choices.find((c) => c !== value) ?? value))}
    />
  );
}

/** 設定の画面の 1 つの項目の欄（選べない形のときは出さない） */
export function SettingsFieldControl({ field, state, set }: Props) {
  const f = viewField(field);
  if (!fieldEnabled(field, state)) return null;
  return (
    <ChoiceField
      label={f.label}
      value={keyOf(state[field])}
      onChange={(next) => set(patchOf(field, f.choices.find((c) => keyOf(c) === next) ?? state[field]))}
      options={f.choices.map((c) => ({ value: keyOf(c), label: choiceMeta(field, c).short }))}
    />
  );
}
