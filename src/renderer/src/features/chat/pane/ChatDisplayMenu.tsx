import { Check, ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { CHAT_HEADER_HIDDEN, CHAT_HEADER_ROW_HIDDEN, COMPOSER_COMPACT, STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem } from "@/ui/PopupMenu";
import {
  CHAT_HEADER_ITEM_LABELS,
  CHAT_HEADER_ITEM_NOTES,
  CHAT_HEADER_SECTIONS,
  hiddenHeaderItems,
  hidesMoreHeaderItems,
  toggleHeaderItem,
  type ChatHeaderItem,
} from "./chatHeaderItems";
import { useWideText } from "./TextWidthToggle";

/** 見出しの行のどの項目を出すか（どのチャットでも同じ。タブの列の「表示」→「見出しの項目」で選ぶ） */
export function useChatHeaderItems() {
  const [saved] = useSetting(CHAT_HEADER_HIDDEN);
  const hidden = hiddenHeaderItems(saved);
  return (item: ChatHeaderItem) => !hidden.has(item);
}

/** 見出しの行を隠しているか（どのチャットでも同じ） */
export function useChatHeaderRowHidden(): boolean {
  return useSetting(CHAT_HEADER_ROW_HIDDEN)[0];
}

/** チャットの画面で、既定より多く隠しているものがあるか（タブの列の「表示」のボタンに点を付け、隠れた状態に気づけるように） */
export function useChatDisplayHides(): boolean {
  const [rowHidden] = useSetting(CHAT_HEADER_ROW_HIDDEN);
  const [saved] = useSetting(CHAT_HEADER_HIDDEN);
  const [stickyHidden] = useSetting(STICKY_PROMPT_HIDDEN);
  return rowHidden || stickyHidden || hidesMoreHeaderItems(saved, CHAT_HEADER_HIDDEN.initial);
}

/** チェックの付く項目（keepOpen: 押してもメニューを閉じない） */
function CheckItem({ on, title, keepOpen, onToggle, children }: { on: boolean; title?: string; keepOpen?: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <MenuItem role="menuitemcheckbox" checked={on} title={title} keepOpen={keepOpen} onSelect={onToggle}>
      <span className="project-switch-item">{children}</span>
      {on && <Check size={14} aria-hidden />}
    </MenuItem>
  );
}

/**
 * 「チャットの画面」のメニューの項目（どのチャットでも共通の表示の設定）: 見出しの行・見出しの項目（横に開く子のメニューで 1 つずつ）・
 * 指示の帯・文の幅・チャット欄のコンパクト表示。タブの列の「表示」のメニュー（チャットを開ける欄）と、見出しの右クリックで同じものを出す。
 * 見出しを隠しても戻せるよう、切り替えは見出しの外（タブの列）に置く。設定の「表示」と同じ値
 */
export function ChatDisplayItems() {
  const [rowHidden, setRowHidden] = useSetting(CHAT_HEADER_ROW_HIDDEN);
  const [saved, setSaved] = useSetting(CHAT_HEADER_HIDDEN);
  const [stickyHidden, setStickyHidden] = useSetting(STICKY_PROMPT_HIDDEN);
  const [wide, setWide] = useWideText();
  const [compact, setCompact] = useSetting(COMPOSER_COMPACT);
  const items = useSubmenu();
  const hidden = hiddenHeaderItems(saved);
  const isDefault = !hidesMoreHeaderItems(saved, CHAT_HEADER_HIDDEN.initial) && !hidesMoreHeaderItems(CHAT_HEADER_HIDDEN.initial, saved);
  return (
    <div className="menu-items">
      <div className="menu-label">チャットの画面（どのチャットでも共通）</div>
      <CheckItem
        on={!rowHidden}
        title={rowHidden ? "見出しの行を表示する（⌥⌘T）" : "見出しの行を隠す（⌥⌘T）。隠しても、動きを見ている間とアーカイブ済みのチャットでは出し、⌘F でチャットの右上に検索欄が出ます"}
        onToggle={() => setRowHidden(!rowHidden)}
      >
        見出しの行
      </CheckItem>
      {/* 乗せる・押す・→ で横に項目の一覧を開く（メニューは閉じない） */}
      <button {...items.trigger} title="見出しの行に出す項目を、1 つずつ選びます">
        <span className="project-switch-item">見出しの項目</span>
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {items.anchor && (
        <MenuFlyout anchor={items.anchor} label="見出しの項目" className="chat-header-items" onBack={items.back}>
          {CHAT_HEADER_SECTIONS.map(({ title, items: section }, i) => (
            <Fragment key={title}>
              {i > 0 && <div className="menu-separator" role="separator" />}
              <div className="menu-label">{title}</div>
              {section.map((item) => {
                const on = !hidden.has(item);
                const note = CHAT_HEADER_ITEM_NOTES[item];
                return (
                  <CheckItem key={item} on={on} title={on ? note : undefined} keepOpen onToggle={() => setSaved(toggleHeaderItem(saved, item))}>
                    {CHAT_HEADER_ITEM_LABELS[item]}
                  </CheckItem>
                );
              })}
            </Fragment>
          ))}
          {!isDefault && (
            <>
              <div className="menu-separator" role="separator" />
              <MenuItem keepOpen onSelect={() => setSaved(CHAT_HEADER_HIDDEN.initial)}>
                <span className="project-switch-item">既定に戻す</span>
              </MenuItem>
            </>
          )}
        </MenuFlyout>
      )}
      <CheckItem
        on={!stickyHidden}
        title="読んでいる返答の元の自分の指示を、チャットの上の帯に出します（帯の右クリックでも隠せます）"
        onToggle={() => setStickyHidden(!stickyHidden)}
      >
        指示の帯
      </CheckItem>
      <CheckItem on={wide} title="発言の流れとチャット欄の幅の上限を外し、パネルいっぱいまで広げます" onToggle={() => setWide(!wide)}>
        文の幅を広げる
      </CheckItem>
      <CheckItem on={compact} title="チャット欄の文字・余白・下のボタンを小さくして、縦の幅を抑えます" onToggle={() => setCompact(!compact)}>
        チャット欄をコンパクトに
      </CheckItem>
    </div>
  );
}
