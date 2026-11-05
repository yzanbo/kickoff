import { Check, SlidersHorizontal } from "lucide-react";
import { Fragment, type MouseEvent } from "react";
import { cx } from "@/lib/cx";
import { CHAT_HEADER_HIDDEN } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import {
  CHAT_HEADER_ITEM_LABELS,
  CHAT_HEADER_ITEM_NOTES,
  CHAT_HEADER_SECTIONS,
  hiddenHeaderItems,
  toggleHeaderItem,
  type ChatHeaderItem,
} from "./chatHeaderItems";

/** 見出しの行のどの項目を出すか（どのチャットでも同じ。見出しの「表示」のメニューで選ぶ） */
export function useChatHeaderItems() {
  const [saved] = useSetting(CHAT_HEADER_HIDDEN);
  const hidden = hiddenHeaderItems(saved);
  return (item: ChatHeaderItem) => !hidden.has(item);
}

const BUTTON_CLASS = "chat-view-button";

/**
 * 見出しの行の「表示」: 見出しに出す項目（バッジ・道具・数）を、項目ごとに表示・非表示で選ぶメニュー。
 * 行の右端のボタンと、見出しの何もないところの右クリックで、同じものを開く。何か隠していればボタンに点を付ける（パネルの「表示」と同じ）。
 * このボタン自体は隠せない（隠すと戻せなくなるため）
 */
export function useChatHeaderView() {
  const [saved, setSaved] = useSetting(CHAT_HEADER_HIDDEN);
  const hidden = hiddenHeaderItems(saved);
  const menu = useContextMenu();
  const changed = hidden.size > 0;
  return {
    /** 見出しの右クリック（ボタン・リンク・入力欄の上では、そのものの右クリックを残す） */
    onContextMenu: (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, a, input, textarea, [role='search']")) return;
      menu.open(e);
    },
    button: (
      <IconButton
        type="button"
        icon={SlidersHorizontal}
        size={15}
        className={cx(BUTTON_CLASS, changed && "changed")}
        label={changed ? "見出しの表示（隠している項目があります）" : "見出しの表示"}
        title="見出しの表示: プロジェクト・作業場所・道具・ターン数などを、項目ごとに表示・非表示にします（見出しの何もないところの右クリックでも開きます）"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={(e) => menu.toggle(e)}
      />
    ),
    menu: menu.menu && (
      <PopupMenu at={menu.menu.at} label="見出しの表示" ignore={`.${BUTTON_CLASS}`} onClose={menu.close}>
        {CHAT_HEADER_SECTIONS.map(({ title, items }, i) => (
          <Fragment key={title}>
            {i > 0 && <div className="menu-separator" role="separator" />}
            <div className="menu-label">{title}</div>
            {items.map((item) => {
              const on = !hidden.has(item);
              const note = CHAT_HEADER_ITEM_NOTES[item];
              return (
                <MenuItem
                  key={item}
                  role="menuitemcheckbox"
                  checked={on}
                  title={on && note ? note : undefined}
                  onSelect={() => setSaved(toggleHeaderItem(saved, item))}
                >
                  <span className="project-switch-item">{CHAT_HEADER_ITEM_LABELS[item]}</span>
                  {on && <Check size={14} aria-hidden />}
                </MenuItem>
              );
            })}
          </Fragment>
        ))}
        {changed && (
          <>
            <div className="menu-separator" role="separator" />
            <MenuItem onSelect={() => setSaved([])}>
              <span className="project-switch-item">すべて表示する</span>
            </MenuItem>
          </>
        )}
      </PopupMenu>
    ),
  };
}
