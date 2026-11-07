import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { useContextMenu } from "@/ui/useContextMenu";

/**
 * プロジェクト一覧の上の見出しの、選択肢が 3 つ以上ある設定（並べ方・まとめ方）のボタン（2 択のものは HeadToggle）。
 * ボタンは 2 段で、上に種類の名前・下にいまの値を出し、押すとその種類の選択肢だけを出す（ChoiceMenu。選択肢のアイコンと名前は meta）。
 * 幅は、取りうる値（values）のうちいちばん長いものに合わせて固定する（選び直しても幅が変わらない）。
 * 狭いときは文字を隠してアイコンだけにする（@container。アイコンもいまの値を表すものを渡す）
 */
export function HeadMenu<T extends string>({
  id,
  icon: Icon,
  label,
  value,
  values,
  title,
  menu,
  extra,
}: {
  id: string;
  /** いまの値を表すアイコン（狭いときに出す） */
  icon: LucideIcon;
  /** 種類の名前（並べ方など） */
  label: string;
  /** いまの値（縦並びなど） */
  value: string;
  /** 取りうる値すべて（幅をいちばん長いものに合わせる） */
  values: string[];
  title: string;
  /** 開くメニュー: 見出し・選択肢（その名前とアイコン）・いま選んでいるもの・選んだとき */
  menu: { title: string; choices: readonly T[]; meta: Record<T, { icon: LucideIcon; label: string }>; current: T; onPick: (choice: T) => void };
  /** 選択肢の下に区切り線を挟んで足す項目（まとめ方の「まとまりを色付きで表示」） */
  extra?: ReactNode;
}) {
  const buttonClass = `head-menu-${id}`;
  const open = useContextMenu();
  const labels = Object.fromEntries(menu.choices.map((c) => [c, menu.meta[c].label])) as Record<T, string>;
  const icons = Object.fromEntries(menu.choices.map((c) => [c, menu.meta[c].icon])) as Record<T, LucideIcon>;
  return (
    <>
      <button
        className={cx("head-chip", buttonClass, open.isOpen && "active")}
        title={title}
        aria-label={`${label}: ${value}`}
        aria-haspopup="menu"
        aria-expanded={open.isOpen}
        onClick={open.toggle}
      >
        <ChipFace icon={Icon} label={label} value={value} values={values} />
      </button>
      {open.menu && (
        <ChoiceMenu
          at={open.menu.at}
          title={menu.title}
          values={menu.choices}
          labels={labels}
          icons={icons}
          value={menu.current}
          ignore={`.${buttonClass}`}
          onPick={menu.onPick}
          onClose={open.close}
        >
          {extra}
        </ChoiceMenu>
      )}
    </>
  );
}

/**
 * 2 択の設定のボタン（押すたびにもう一方に切り替える。メニューは出さない）。見た目は HeadMenu と同じ 2 段で、
 * マウスを乗せたときの説明に、押すと何に切り替わるかを出す
 */
export function HeadToggle({
  id,
  icon,
  label,
  value,
  values,
  title,
  disabled,
  onToggle,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  value: string;
  /** 2 つの値（幅はいちばん長いものに合わせる） */
  values: [string, string];
  /** 何の設定か（説明の先頭） */
  title: string;
  /** 押せない（ほかの設定で値が決まっているとき。理由は title に書く） */
  disabled?: boolean;
  onToggle: () => void;
}) {
  const next = values[0] === value ? values[1] : values[0];
  return (
    <button
      className={`head-chip head-toggle-${id}`}
      title={disabled ? title : `${title}: ${value}（押すと「${next}」に切り替え）`}
      aria-label={disabled ? `${label}: ${value}` : `${label}: ${value}（押すと「${next}」）`}
      disabled={disabled}
      onClick={onToggle}
    >
      <ChipFace icon={icon} label={label} value={value} values={values} />
    </button>
  );
}

/** ボタンの中身: 狭いときのアイコンと、上に種類の名前・下にいまの値 */
function ChipFace({ icon: Icon, label, value, values }: { icon: LucideIcon; label: string; value: string; values: string[] }) {
  return (
    <>
      <Icon size={13} className="head-chip-icon" aria-hidden />
      <span className="head-chip-text">
        <span className="head-chip-label">{label}</span>
        {/* 取りうる値を同じ場所に重ねて置き、いまの値だけを見せる（幅はいちばん長い値で決まる） */}
        <span className="head-chip-value">
          {[...new Set([value, ...values])].map((v) => (
            <span key={v} className={v === value ? undefined : "head-chip-sizer"} aria-hidden={v === value ? undefined : true}>
              {v}
            </span>
          ))}
        </span>
      </span>
    </>
  );
}
