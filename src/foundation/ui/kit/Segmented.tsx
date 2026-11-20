import type { LucideIcon } from "lucide-react";
import { useRef } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { tipProps } from "./HoverTip";
import { useRovingList } from "./list/useRovingList";

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
  /** 押せない（理由は tip に書く） */
  disabled?: boolean;
}

/** look ごとのクラス（見た目は styles の .theme-switch・.view-toggle） */
const LOOK_CLASS = { switch: "segmented theme-switch", toggle: "view-toggle" } as const;

/**
 * 選択肢から 1 つを選ぶボタンの組（ボード／リスト、テーマ、並べ方など）。
 * 見た目は look（switch = 設定の切り替え・toggle = 見出しの表示の切り替え）か className で決め（どちらもなければ segmented）、
 * 選んでいるボタンには active が付く。←→ で隣を選ぶ（端では回り込む）
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  look,
  className,
  iconSize = 13,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  /** 組の名前（読み上げ用） */
  label: string;
  look?: keyof typeof LOOK_CLASS;
  /** 足すクラス（look がなければ、これだけで見た目を決める） */
  className?: string;
  iconSize?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const roving = useRovingList({ mode: "focus", ref, orientation: "horizontal", onMove: (button) => button.dataset.value !== value && onChange(button.dataset.value as T) });
  return (
    <div ref={ref} className={look ? cx(LOOK_CLASS[look], className) : (className ?? "segmented")} role="radiogroup" aria-label={label} onKeyDown={roving.onKeyDown}>
      {options.map(({ value: v, label: text, icon: Icon, iconOnly, tip, keys, badge, disabled }) => (
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
          disabled={disabled}
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
