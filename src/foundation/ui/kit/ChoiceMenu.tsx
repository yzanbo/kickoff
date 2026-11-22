import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { Placement } from "@/foundation/ui/lib/floating";
import { MenuItem, PopupMenu } from "./PopupMenu";

/** 選択肢のまとまり（見出しは省ける。説明は項目の下に小さく出す） */
export interface ChoiceGroup<T extends string> {
  label?: string;
  choices: readonly { value: T; label: string; description?: string; disabled?: boolean }[];
}

/**
 * 右クリック・ボタンで出す、選択肢から 1 つ選ぶメニュー（見出し・選択肢のアイコン（あれば）・選んでいるものにチェック）。
 * 選ぶとメニューを閉じてから onPick を呼ぶ。サイドバーの見出しのボタン（HeadMenu）もこれを開く。
 * groups を渡すと、まとまりごとの見出しと区切り・選択肢の説明で出す（チャット欄のモデル・推論の深さ・権限モード）
 */
export function ChoiceMenu<T extends string>({
  at,
  title,
  values = [],
  labels,
  icons,
  groups,
  value,
  disabled,
  titles,
  ignore,
  className,
  onPick,
  onClose,
  children,
}: {
  /** 置く場所（useContextMenu の menu.at） */
  at: Placement;
  /** メニューの見出し（aria-label にも使う。groups のときは見出しを出さない） */
  title: string;
  values?: readonly T[];
  labels?: Record<T, string>;
  /** 選択肢の前に出すアイコン */
  icons?: Partial<Record<T, LucideIcon>>;
  groups?: readonly ChoiceGroup<T>[];
  value: T;
  /** 選べない選択肢と、その理由（押せない形にして、乗せると理由） */
  disabled?: Partial<Record<T, string>>;
  /** 選べる選択肢に乗せたときの説明（選んだあとの戻し方など） */
  titles?: Partial<Record<T, string>>;
  /** 外側クリックで閉じない要素（開いたボタンなど） */
  ignore?: string;
  className?: string;
  onPick: (value: T) => void;
  onClose: () => void;
  /** 選択肢の下に、区切り線を挟んで並べるほかの項目 */
  children?: ReactNode;
}) {
  const item = (v: T, label: string, description?: string, off?: boolean) => {
    const Icon: LucideIcon | undefined = icons?.[v];
    return (
      <MenuItem key={v} radio checked={v === value} disabled={off || disabled?.[v] !== undefined} title={disabled?.[v] ?? titles?.[v]} onSelect={() => onPick(v)}>
        {Icon && <Icon size={14} aria-hidden />}
        {description === undefined ? (
          <span className="menu-item-label">{label}</span>
        ) : (
          <span className="menu-item-text">
            <span className="menu-item-label">{label}</span>
            <span className="menu-item-desc">{description}</span>
          </span>
        )}
      </MenuItem>
    );
  };
  return (
    <PopupMenu at={at} label={title} ignore={ignore} className={className} onClose={onClose}>
      {groups ? (
        groups.map((g, i) => (
          <Fragment key={g.label ?? i}>
            {i > 0 && <div className="menu-separator" role="separator" />}
            {g.label && <div className="menu-label">{g.label}</div>}
            {g.choices.map((c) => item(c.value, c.label, c.description, c.disabled))}
          </Fragment>
        ))
      ) : (
        <>
          <div className="menu-label">{title}</div>
          {values.map((v) => item(v, labels?.[v] ?? v))}
        </>
      )}
      {children && <div className="menu-separator" role="separator" />}
      {children}
    </PopupMenu>
  );
}
