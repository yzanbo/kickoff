import { useRef, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { ChatDisplayItems, useChatHeaderItems, useChatHeaderRowHidden } from "./ChatDisplayMenu";
import { ChatFontSizeButton } from "./ChatFontSizeButton";
import { TextWidthToggle, useWideText } from "./TextWidthToggle";

/**
 * 送る前のチャット（新しいチャット・新しい子チャットのタブ）の画面の枠。チャットの画面（ChatPane・ChatHeader）と同じ決まりで描く:
 * 見出しの行（隠していれば出さない）・左にバッジ（badges。どれを出すかは呼ぶ側が useChatHeaderItems で決める）・右に道具・会話の横幅（.wide）・
 * 見出しと流れの何もないところの右クリックで「チャットの画面」のメニュー。
 * 道具は会話がなくても効くもの（会話の横幅・会話の文字の大きさ）だけを出す（会話 / 動き・指示の帯・検索・ターン数・右の欄の開閉は、会話ができてから）
 */
export function DraftChatPage({ className, badges, hero, children }: { className?: string; badges: ReactNode; hero: ReactNode; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const [wide] = useWideText();
  const shows = useChatHeaderItems();
  const rowHidden = useChatHeaderRowHidden();
  const menu = useContextMenu();
  // ボタン・リンク・入力欄の上では、そのものの右クリックを残す（チャットの見出しと同じ）
  const onBlankContextMenu = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [role='search']")) return;
    menu.open(e);
  };
  return (
    <div ref={page} className={cx("chat-page chat-panel new-chat", wide && "wide", className)}>
      {rowHidden ? (
        <header className="chat-header collapsed" />
      ) : (
        <header className="chat-header" onContextMenu={onBlankContextMenu}>
          {/* 名前と閉じるはタブに出すので、見出しには出さない（チャットの見出しと同じ） */}
          <div className="chat-title-row">
            <span className="chat-sub muted small">{badges}</span>
            <span className="spacer" />
            <span className="chat-tools">
              {shows("textWidth") && <TextWidthToggle panel={page} />}
              {shows("fontSize") && <ChatFontSizeButton />}
            </span>
          </div>
        </header>
      )}
      <div className="timeline" onContextMenu={onBlankContextMenu}>
        {hero}
      </div>
      <div className="chat-composer">{children}</div>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="チャットの画面" onClose={menu.close}>
          <ChatDisplayItems />
        </PopupMenu>
      )}
    </div>
  );
}
