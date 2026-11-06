import { ChevronDown, type LucideIcon } from "lucide-react";
import { useId, type CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { ChoiceMenu } from "./ChoiceMenu";
import { useContextMenu } from "./useContextMenu";

/**
 * 選べる札: 見た目は札（className で札の形と色。hue は札の色 --group-hue）のまま、名前の右に ▾ を付け、押すと下に 1 つ選ぶメニュー（ChoiceMenu）を開く。
 * 新しいチャットの見出しの作成先のグループ・作業場所（チャットの見出しのグループの札・ブランチの印と同じ形で、選べることだけを ▾ で示す）。
 * empty は「選んでいない」（グループなしなど）で、色を付けず控えめに出す
 */
export function ChipPicker<T extends string>({
  className,
  hue,
  empty,
  icon: Icon,
  name,
  tip,
  menuTitle,
  values,
  labels,
  value,
  onPick,
}: {
  className: string;
  hue?: number;
  empty?: boolean;
  icon: LucideIcon;
  /** 札に出す名前 */
  name: string;
  /** 乗せたときの説明 */
  tip: string;
  menuTitle: string;
  values: readonly T[];
  labels: Record<T, string>;
  value: T;
  onPick: (value: T) => void;
}) {
  const menu = useContextMenu();
  // 開いたボタンをもう一度押したら閉じる（外側のクリックとして閉じたあとに開き直さない。ほかの札は外側として扱う）
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={cx(className, "chip-picker", empty && "is-empty")}
        style={hue === undefined ? undefined : ({ "--group-hue": hue } as CSSProperties)}
        data-chip-picker={id}
        data-tip={tip}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={(e) => menu.toggle(e)}
      >
        <Icon size={11} aria-hidden />
        <span className="chip-name">{name}</span>
        <ChevronDown size={11} aria-hidden className="chip-picker-caret" />
      </button>
      {menu.menu && (
        <ChoiceMenu
          at={menu.menu.at}
          title={menuTitle}
          values={values}
          labels={labels}
          value={value}
          ignore={`[data-chip-picker="${id}"]`}
          onPick={onPick}
          onClose={menu.close}
        />
      )}
    </>
  );
}
