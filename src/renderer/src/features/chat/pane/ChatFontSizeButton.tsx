import { ALargeSmall, Check } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { CHAT_FONT_SIZE_LABELS, CHAT_FONT_SIZES, useChatFontSize } from "./chatFontSize";

const BUTTON_CLASS = "chat-font-size-button";

/**
 * 見出しの行の「会話の文字の大きさ」: 押すと下に 5 段階のメニュー（極小・小・標準・大・特大）。会話の文字だけを変える（どのチャットでも同じ。
 * タブの列の「表示」・設定の「表示」と同じ値）。見出しの項目「会話の文字の大きさ」で隠せる
 */
export function ChatFontSizeButton() {
  const [size] = useChatFontSize();
  const menu = useContextMenu({ align: "end" });
  const label = `会話の文字の大きさ（${CHAT_FONT_SIZE_LABELS[size]}）`;
  return (
    <>
      <IconButton
        icon={ALargeSmall}
        label={label}
        title={`${label}: 会話の文字だけを大きく・小さくします`}
        className={BUTTON_CLASS}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={(e) => menu.toggle(e)}
      />
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="会話の文字の大きさ" ignore={`.${BUTTON_CLASS}`} onClose={menu.close}>
          <ChatFontSizeItems />
        </PopupMenu>
      )}
    </>
  );
}

/** 5 段階の選択肢（メニューの中に並べる。見出しの行のボタン・タブの列の「表示」の子のメニューで共通） */
export function ChatFontSizeItems() {
  const [size, setSize] = useChatFontSize();
  return (
    <>
      {CHAT_FONT_SIZES.map((s) => (
        <MenuItem key={s} role="menuitemradio" checked={s === size} onSelect={() => setSize(s)}>
          <span className="project-switch-item">{CHAT_FONT_SIZE_LABELS[s]}</span>
          {s === size && <Check size={14} aria-hidden />}
        </MenuItem>
      ))}
    </>
  );
}
