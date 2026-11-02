import { Check, type LucideIcon } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { cx } from "../../cx";
import { useMenuKeys } from "../../hooks/useMenuKeys";
import { clampToViewport, PopupMenu } from "../PopupMenu";

/** メニューの 1 項目（radio はどれか 1 つ、checkbox はオン・オフ） */
export interface HeadMenuItem {
  key: string;
  role: "menuitemradio" | "menuitemcheckbox";
  icon: LucideIcon;
  label: string;
  checked: boolean;
  onSelect: () => void;
}

/** メニューのまとまり（label は見出し） */
export interface HeadMenuSection {
  label?: string;
  items: HeadMenuItem[];
}

/**
 * プロジェクト一覧の上の見出しの、選択肢が 3 つ以上ある設定（まとめ方）のボタン（2 択のものは HeadToggle）。
 * ボタンは 2 段で、上に種類の名前・下にいまの値を出し、押すとその種類の選択肢だけを出す。
 * 幅は、取りうる値（values）のうちいちばん長いものに合わせて固定する（選び直しても幅が変わらない）。
 * 狭いときは文字を隠してアイコンだけにする（@container。アイコンもいまの値を表すものを渡す）
 */
export function HeadMenu({
  id,
  icon: Icon,
  label,
  value,
  values,
  title,
  sections,
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
  sections: HeadMenuSection[];
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const buttonClass = `head-menu-${id}`;
  return (
    <>
      <button
        className={cx("head-chip", buttonClass, at && "active")}
        title={title}
        aria-label={`${label}: ${value}`}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={(e) => {
          // 開いているときに押したら閉じる
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setAt(clampToViewport(r.left, r.bottom + 4, 260, 40 + sections.reduce((n, s) => n + s.items.length * 34 + (s.label ? 24 : 0), 0)));
        }}
      >
        <ChipFace icon={Icon} label={label} value={value} values={values} />
      </button>
      {at && <Menu {...at} label={label} ignore={`.${buttonClass}`} sections={sections} onClose={() => setAt(null)} />}
    </>
  );
}

function Menu({ x, y, label, ignore, sections, onClose }: { x: number; y: number; label: string; ignore: string; sections: HeadMenuSection[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  return (
    <PopupMenu x={x} y={y} label={label} ignore={ignore} menuRef={ref} onClose={onClose}>
      {sections.map((section, i) => (
        <Fragment key={section.label ?? i}>
          {i > 0 && <div className="menu-separator" role="separator" />}
          {section.label && <div className="menu-label">{section.label}</div>}
          {section.items.map(({ key, role, icon: ItemIcon, label: itemLabel, checked, onSelect }) => (
            <button
              key={key}
              role={role}
              aria-checked={checked}
              onClick={() => {
                onClose();
                onSelect();
              }}
            >
              <ItemIcon size={14} aria-hidden />
              <span className="project-switch-item">{itemLabel}</span>
              {checked && <Check size={14} aria-hidden />}
            </button>
          ))}
        </Fragment>
      ))}
    </PopupMenu>
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
  onToggle: () => void;
}) {
  const next = values[0] === value ? values[1] : values[0];
  return (
    <button className={`head-chip head-toggle-${id}`} title={`${title}: ${value}（押すと「${next}」に切り替え）`} aria-label={`${label}: ${value}（押すと「${next}」）`} onClick={onToggle}>
      <ChipFace icon={icon} label={label} value={value} values={values} />
    </button>
  );
}

/**
 * 設定ではなく操作のボタン（すべて閉じる / 開くなど）。見た目はほかと同じ 2 段で、上に何に効くか・下に押すと何をするかを出す
 * （狭いときはほかと同じくアイコンだけ）。label・title は操作そのものを言う
 */
export function HeadAction({
  id,
  icon,
  caption,
  action,
  actions,
  label,
  title,
  onClick,
}: {
  id: string;
  icon: LucideIcon;
  /** 上の段（何に効くか） */
  caption: string;
  /** 下の段（押すと何をするか） */
  action: string;
  /** 下の段に出しうる文（幅はいちばん長いものに合わせる） */
  actions: string[];
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button className={`head-chip head-action-${id}`} title={title} aria-label={label} onClick={onClick}>
      <ChipFace icon={icon} label={caption} value={action} values={actions} />
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
