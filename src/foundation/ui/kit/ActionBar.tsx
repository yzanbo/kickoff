// 操作の表（ボタン列と右クリックのメニューを同じ表から描く）
import type { LucideIcon } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";
import { MenuItem } from "./PopupMenu";

/** 操作 1 つ。disabled は押せない理由（押せるなら false か省く。理由はボタンとメニューの項目の title に出す） */
export interface ActionSpec {
  id: string;
  label: string;
  icon?: LucideIcon;
  disabled?: string | false;
  danger?: boolean;
  run: () => void;
}

/** 表のうち押せない理由（なければ undefined） */
const reasonOf = (spec: ActionSpec) => spec.disabled || undefined;

/** 操作の表をボタン列に描く */
export function ActionBar({ specs, className, label }: { specs: readonly ActionSpec[]; className?: string; label: string }) {
  return (
    <div className={cx("action-bar", className)} role="toolbar" aria-label={label}>
      {specs.map((spec) => (
        <button key={spec.id} type="button" className={cx("btn", spec.danger && "btn-danger")} data-size="sm" disabled={Boolean(spec.disabled)} title={reasonOf(spec)} onClick={spec.run}>
          {spec.icon && <spec.icon size={13} aria-hidden />} {spec.label}
        </button>
      ))}
    </div>
  );
}

/** 同じ操作の表を、右クリックのメニューの項目にする */
export function actionsToMenuItems(specs: readonly ActionSpec[]) {
  return specs.map((spec) => (
    <MenuItem key={spec.id} danger={spec.danger} disabled={Boolean(spec.disabled)} title={reasonOf(spec)} onSelect={spec.run}>
      {spec.icon && <spec.icon size={14} aria-hidden />} {spec.label}
    </MenuItem>
  ));
}
