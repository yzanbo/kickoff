import { Check, type LucideIcon } from "lucide-react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "./PopupMenu";

/**
 * 右クリック・ボタンで出す、選択肢から 1 つ選ぶメニュー（見出し・選択肢のアイコン（あれば）・選んでいるものにチェック）。
 * 選ぶとメニューを閉じてから onPick を呼ぶ。サイドバーの見出しのボタン（HeadMenu）もこれを開く
 */
export function ChoiceMenu<T extends string>({
  at,
  title,
  values,
  labels,
  icons,
  value,
  ignore,
  onPick,
  onClose,
}: {
  /** 置く場所（useContextMenu の menu.at） */
  at: Placement;
  /** メニューの見出し（aria-label にも使う） */
  title: string;
  values: readonly T[];
  labels: Record<T, string>;
  /** 選択肢の前に出すアイコン */
  icons?: Partial<Record<T, LucideIcon>>;
  value: T;
  /** 外側クリックで閉じない要素（開いたボタンなど） */
  ignore?: string;
  onPick: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu at={at} label={title} ignore={ignore} onClose={onClose}>
      <div className="menu-label">{title}</div>
      {values.map((v) => {
        const Icon: LucideIcon | undefined = icons?.[v];
        return (
          <MenuItem key={v} role="menuitemradio" checked={v === value} onSelect={() => onPick(v)}>
            {Icon && <Icon size={14} aria-hidden />}
            <span className="project-switch-item">{labels[v]}</span>
            {v === value && <Check size={14} aria-hidden />}
          </MenuItem>
        );
      })}
    </PopupMenu>
  );
}
