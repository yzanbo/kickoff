import type { LucideIcon } from "lucide-react";
import { tipProps } from "./HoverTip";

export interface ToggleOption<K extends string> {
  key: K;
  label: string;
  /** 文字の前に出すアイコン */
  icon?: LucideIcon;
  /** マウスを乗せたときの説明（「名前（説明）」なら見出しと説明に分ける） */
  tip?: string;
  /** オンか */
  on: boolean;
}

/**
 * それぞれをオン・オフするボタンの組（Segmented と同じ見た目で、1 つを選ぶのではなく、どれもオン・オフできる）。
 * 見た目は className（view-toggle など）で決め、オンのボタンには active が付く（aria-pressed）
 */
export function ToggleButtons<K extends string>({
  options,
  onToggle,
  label,
  className,
  iconSize = 13,
}: {
  options: ToggleOption<K>[];
  onToggle: (key: K) => void;
  /** 組の名前（読み上げ用） */
  label: string;
  className: string;
  iconSize?: number;
}) {
  return (
    <div className={className} role="group" aria-label={label}>
      {options.map(({ key, label: text, icon: Icon, tip, on }) => (
        <button key={key} type="button" aria-pressed={on} className={on ? "active" : ""} data-value={key} {...(tip ? tipProps(tip) : {})} onClick={() => onToggle(key)}>
          {Icon && <Icon size={iconSize} />}
          {Icon ? <> <span className="btn-label">{text}</span></> : text}
        </button>
      ))}
    </div>
  );
}
