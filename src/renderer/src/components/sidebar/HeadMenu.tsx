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
 * プロジェクト一覧の上の見出しの行の、設定の種類（並べ方・並び順・まとめ方・表示）ごとのボタン。
 * ボタンには種類の名前を文字で出し、押すとその種類の選択肢だけを出す。狭いときは文字を隠してアイコンだけにする（@container）
 */
export function HeadMenu({ id, icon: Icon, label, title, sections }: { id: string; icon: LucideIcon; label: string; title: string; sections: HeadMenuSection[] }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const buttonClass = `head-menu-${id}`;
  return (
    <>
      <button
        className={cx("head-chip", buttonClass, at && "active")}
        title={title}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={(e) => {
          // 開いているときに押したら閉じる
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setAt(clampToViewport(r.left, r.bottom + 4, 260, 40 + sections.reduce((n, s) => n + s.items.length * 34 + (s.label ? 24 : 0), 0)));
        }}
      >
        <Icon size={13} className="head-chip-icon" aria-hidden />
        <span className="head-chip-label">{label}</span>
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
