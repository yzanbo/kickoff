import type { LucideIcon } from "lucide-react";
import { tipProps } from "./HoverTip";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** 文字の前に出すアイコン */
  icon?: LucideIcon;
  /** アイコンだけで見せる（label は読み上げと、マウスを乗せたときの説明 HoverTip に使う。「名前（説明）」なら見出しと説明に分ける） */
  iconOnly?: boolean;
  /** 文字で見せるときの、マウスを乗せたときの説明（「名前（説明）」なら見出しと説明に分ける） */
  tip?: string;
  /** マウスを乗せたときの説明に添えるショートカットのキー（「⌘Enter」など） */
  keys?: string;
  /** 右上に出す数（0 なら出さない。変更のあるファイルの数など） */
  badge?: number;
}

/**
 * 選択肢から 1 つを選ぶボタンの組（ボード／リスト、テーマ、並べ方など）。
 * 見た目は className（segmented・view-toggle など）で決め、選んでいるボタンには active が付く
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  iconSize = 13,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  /** 組の名前（読み上げ用） */
  label: string;
  className: string;
  iconSize?: number;
}) {
  return (
    <div className={className} role="radiogroup" aria-label={label}>
      {options.map(({ value: v, label: text, icon: Icon, iconOnly, tip, keys, badge }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={value === v ? "active" : ""}
          data-value={v}
          {...(iconOnly ? tipProps(text) : tip ? tipProps(tip) : {})}
          data-tip-keys={keys}
          aria-label={iconOnly ? text : undefined}
          onClick={() => onChange(v)}
        >
          {Icon && <Icon size={iconSize} />}
          {!iconOnly && (Icon ? <> <span className="btn-label">{text}</span></> : text)}
          {Boolean(badge) && <span className="segmented-badge">{badge}</span>}
        </button>
      ))}
    </div>
  );
}
