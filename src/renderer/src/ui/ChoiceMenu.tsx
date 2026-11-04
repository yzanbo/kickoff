import { Check } from "lucide-react";
import { MenuItem, PopupMenu } from "./PopupMenu";

/**
 * 右クリックなどで出す、選択肢から 1 つ選ぶメニュー（見出し・選んでいるものにチェック）。
 * 選ぶとメニューを閉じてから onPick を呼ぶ
 */
export function ChoiceMenu<T extends string>({
  x,
  y,
  title,
  values,
  labels,
  value,
  ignore,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  /** メニューの見出し（aria-label にも使う） */
  title: string;
  values: readonly T[];
  labels: Record<T, string>;
  value: T;
  /** 外側クリックで閉じない要素（開いたボタンなど） */
  ignore?: string;
  onPick: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu x={x} y={y} label={title} ignore={ignore} onClose={onClose}>
      <div className="menu-label">{title}</div>
      {values.map((v) => (
        <MenuItem key={v} role="menuitemradio" checked={v === value} onSelect={() => onPick(v)}>
          <span className="project-switch-item">{labels[v]}</span>
          {v === value && <Check size={14} aria-hidden />}
        </MenuItem>
      ))}
    </PopupMenu>
  );
}
