import { Check, ChevronRight, GripVertical } from "lucide-react";
import { useCommandKeys } from "@/foundation/ui/commands";
import { Fragment, type ComponentProps, type ReactNode } from "react";
import { storage } from "@/features/conversation/ui/storage";
import { snippetsSettings } from "@/features/snippets/ui";
import { CHAT_HEADER_BADGE_COLORS, CHAT_HEADER_ROW_HIDDEN, CHAT_TAB_ROW_HIDDEN, COMPOSER_COMPACT, STICKY_PROMPT_HIDDEN } from "@/foundation/ui/storage/storageKeys";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { MenuFlyout, useSubmenu } from "@/foundation/ui/kit/MenuFlyout";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import {
  CHAT_HEADER_ITEM_LABELS,
  CHAT_HEADER_ITEM_NOTES,
  hiddenHeaderItems,
  isDefaultHeaderOrder,
  sameHiddenItems,
  sortHeaderItems,
  toggleHeaderItem,
  type ChatHeaderItem,
} from "./chatHeaderItems";
import { useHeaderItemDrag } from "./useHeaderItemDrag";
import { useWideText } from "./TextWidthToggle";
import { CHAT_FONT_SIZE_LABELS, useChatFontSize } from "./chatFontSize";
import { ChatFontSizeItems } from "./ChatFontSizeButton";

/** 見出しの行のどの項目を出すか（どのチャットでも同じ。チャットの見出しの右クリックの「チャット画面表示」→「見出しに出す項目」で選ぶ） */
export function useChatHeaderItems() {
  const [saved] = useSetting(storage.settings.headerHidden);
  const hidden = hiddenHeaderItems(saved);
  return (item: ChatHeaderItem) => !hidden.has(item);
}

/** 見出しの行の項目を、覚えた並び（「見出しに出す項目」のドラッグで並べ替えたもの）にする */
export function useChatHeaderOrder() {
  const [order] = useSetting(storage.settings.headerOrder);
  return <T extends ChatHeaderItem>(items: readonly T[]) => sortHeaderItems(order, items);
}

/** 見出しのグループ・作業場所のバッジを色付きで表示するか（どのチャットでも同じ。外すと灰色の枠と文字だけ） */
export function useChatHeaderBadgeColors(): boolean {
  return useSetting(CHAT_HEADER_BADGE_COLORS)[0];
}

/** 見出しの行を隠しているか（どのチャットでも同じ） */
export function useChatHeaderRowHidden(): boolean {
  return useSetting(CHAT_HEADER_ROW_HIDDEN)[0];
}

/** チェックの付く項目（keepOpen: 押してもメニューを閉じない。buttonProps: ドラッグで並べ替える項目の属性。grip: 左のつまみの印（"space" は印を出さずに幅だけ空け、文字の位置をそろえる）） */
function CheckItem({
  on,
  title,
  keepOpen,
  grip,
  buttonProps,
  onToggle,
  children,
}: {
  on: boolean;
  title?: string;
  keepOpen?: boolean;
  grip?: boolean | "space";
  buttonProps?: ComponentProps<typeof MenuItem>["buttonProps"];
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <MenuItem role="menuitemcheckbox" checked={on} title={title} keepOpen={keepOpen} className={buttonProps?.className} buttonProps={buttonProps} onSelect={onToggle}>
      {grip && <GripVertical size={12} className={grip === "space" ? "menu-grip space" : "menu-grip"} aria-hidden />}
      <span className="project-switch-item">{children}</span>
      {on && <Check size={14} aria-hidden />}
    </MenuItem>
  );
}

/**
 * 「チャット画面表示」のメニューの項目（どのチャットでも共通の表示の設定）。いちばん上の題名「チャット画面表示」を太字にして区切り線で分け、その下の 3 つの組それぞれに見出しを付ける:
 * 「表示 / 非表示」= 画面の上から順に出す・隠すもの（タブの列・見出しの行・指示の帯・定型文の帯）｜「見出し」= 見出しに出す項目（横に開く子のメニューで 1 つずつ）・バッジを色付きで表示 ｜
 * 「幅と大きさ」= 会話の横幅・会話の文字の大きさ（横に開く子のメニューで 5 段階）・チャット欄のコンパクト表示。見出し・指示の帯・会話の何もないところの右クリックで出す。
 * タブの列・見出しを隠しても指示の帯・会話の右クリックから戻せる。設定の「表示」と同じ値
 */
export function ChatDisplayItems() {
  const [tabRowHidden, setTabRowHidden] = useSetting(CHAT_TAB_ROW_HIDDEN);
  const [rowHidden, setRowHidden] = useSetting(CHAT_HEADER_ROW_HIDDEN);
  const rowKeys = useCommandKeys("conversation.toggleHeaderRow");
  const [saved, setSaved] = useSetting(storage.settings.headerHidden);
  const [badgeColors, setBadgeColors] = useSetting(CHAT_HEADER_BADGE_COLORS);
  const [stickyHidden, setStickyHidden] = useSetting(STICKY_PROMPT_HIDDEN);
  const [snippetBarHidden, setSnippetBarHidden] = useSetting(snippetsSettings.barHidden);
  const [wide, setWide] = useWideText();
  const [compact, setCompact] = useSetting(COMPOSER_COMPACT);
  const items = useSubmenu();
  const drag = useHeaderItemDrag();
  const fontSizes = useSubmenu();
  const [fontSize] = useChatFontSize();
  const hidden = hiddenHeaderItems(saved);
  const separator = <div className="menu-separator" role="separator" />;
  return (
    <div className="menu-items">
      {/* 題名は組の見出しより一段上に見えるよう、太字にして下に区切り線を引く（組の見出しと同じ見た目だと、見出しが 2 段重なって見える） */}
      <div className="menu-label menu-title" title="どのチャットでも共通の表示です（設定の「表示」と同じ値）">
        チャット画面表示
      </div>
      {separator}
      {/* 画面の上から順に、出す・隠すを切り替えるもの（1 つのまとまりにし、効く場所ごとには分けない） */}
      <div className="menu-label">表示 / 非表示</div>
      <CheckItem
        on={!tabRowHidden}
        title={
          tabRowHidden
            ? "チャットのタブの列を表示する"
            : "チャットのタブの列を隠す（タブの列の道具も隠れます）。会話の何もないところ・見出しの右クリックと、設定の「表示」で戻せます"
        }
        onToggle={() => setTabRowHidden(!tabRowHidden)}
      >
        タブの列
      </CheckItem>
      <CheckItem
        on={!rowHidden}
        title={rowHidden ? `見出しの行を表示する（${rowKeys}）` : `見出しの行を隠す（${rowKeys}）。隠しても、動きを見ている間とアーカイブ済みのチャットでは出し、⌘F でチャットの右上に検索欄が出ます`}
        onToggle={() => setRowHidden(!rowHidden)}
      >
        見出しの行
      </CheckItem>
      <CheckItem
        on={!stickyHidden}
        title="読んでいる返答の元の自分の指示を、チャットの上の帯に出します（帯の右クリックでも隠せます）"
        onToggle={() => setStickyHidden(!stickyHidden)}
      >
        指示の帯
      </CheckItem>
      <CheckItem
        on={!snippetBarHidden}
        title="チャット欄の枠の中のいちばん上に、このプロジェクトで使う定型文を横に並べます（帯の右クリック・設定の「定型文」でも切り替えられます）"
        onToggle={() => setSnippetBarHidden(!snippetBarHidden)}
      >
        定型文の帯
      </CheckItem>
      {separator}
      <div className="menu-label">見出し</div>
      {/* 乗せる・押す・→ で横に項目の一覧を開く（メニューは閉じない） */}
      <button {...items.trigger} title="見出しの行に出すバッジ・ボタン・数を、1 つずつ選びます">
        <span className="project-switch-item">見出しに出す項目</span>
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {items.anchor && (
        <MenuFlyout anchor={items.anchor} label="見出しに出す項目" className="chat-header-items" onBack={items.back}>
          {/* まとまりの中は、ドラッグで並べ替えられる（見出しの行もこの順に出す。ほかのまとまりへは動かさない） */}
          {drag.sections.map(({ title, items: section }, i) => (
            <Fragment key={title}>
              {i > 0 && <div className="menu-separator" role="separator" />}
              <div className="menu-label">{title}</div>
              {section.map((item) => {
                const on = !hidden.has(item);
                const note = CHAT_HEADER_ITEM_NOTES[item];
                const dragNote = section.length > 1 ? "ドラッグで、この中の並び（見出しの行の並び）を変えられます" : undefined;
                return (
                  <CheckItem
                    key={item}
                    on={on}
                    title={[on ? note : undefined, dragNote].filter(Boolean).join("\n") || undefined}
                    keepOpen
                    grip={section.length > 1 || "space"}
                    buttonProps={section.length > 1 ? drag.itemProps(item) : undefined}
                    onToggle={() => setSaved(toggleHeaderItem(saved, item))}
                  >
                    {CHAT_HEADER_ITEM_LABELS[item]}
                  </CheckItem>
                );
              })}
            </Fragment>
          ))}
          {/* 初めの選び方と並びに戻す（「すべて表示する」でなく初めの形に。初めのままなら押せない） */}
          <div className="menu-separator" role="separator" />
          <MenuItem
            keepOpen
            disabled={sameHiddenItems(saved, storage.settings.headerHidden.initial) && isDefaultHeaderOrder(drag.order)}
            title="見出しに出す項目を、初めの選び方と並びに戻します"
            onSelect={() => {
              setSaved([...storage.settings.headerHidden.initial]);
              drag.resetOrder();
            }}
          >
            <span className="project-switch-item">既定に戻す</span>
          </MenuItem>
        </MenuFlyout>
      )}
      <CheckItem
        on={badgeColors}
        title={badgeColors ? "グループ・作業場所のバッジの色を消して、灰色の枠と文字だけにします" : "グループ・作業場所のバッジを、それぞれの色（タブの列のまとまりと同じ色）で表示します"}
        onToggle={() => setBadgeColors(!badgeColors)}
      >
        バッジを色付きで表示
      </CheckItem>
      {separator}
      <div className="menu-label">幅と大きさ</div>
      <CheckItem on={wide} title="発言の流れとチャット欄の幅の上限を外し、パネルいっぱいまで広げます（パネルの大きさはそのまま）" onToggle={() => setWide(!wide)}>
        会話の横幅を広げる
      </CheckItem>
      {/* 乗せる・押す・→ で横に 5 段階を開く */}
      <button {...fontSizes.trigger} title="会話の文字だけを大きく・小さくします（見出し・入力欄はそのまま）">
        <span className="project-switch-item">会話の文字の大きさ</span>
        <span className="muted small">{CHAT_FONT_SIZE_LABELS[fontSize]}</span>
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {fontSizes.anchor && (
        <MenuFlyout anchor={fontSizes.anchor} label="会話の文字の大きさ" onBack={fontSizes.back}>
          <ChatFontSizeItems />
        </MenuFlyout>
      )}
      <CheckItem on={compact} title="チャット欄の文字・余白・下のボタンを小さくして、縦の幅を抑えます" onToggle={() => setCompact(!compact)}>
        チャット欄をコンパクトに
      </CheckItem>
    </div>
  );
}
