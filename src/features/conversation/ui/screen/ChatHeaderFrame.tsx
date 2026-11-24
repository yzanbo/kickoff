import type { MouseEvent, ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useChatHeaderBadgeColors } from "@/features/conversation/ui/display/ChatDisplayMenu";

/**
 * チャットの見出しの行の枠（チャットの画面と送る前のチャットで同じ形）: 左にバッジ（badges）・名前など（title）、右に道具（tools）と端のもの（end）。
 * 名前と閉じるはタブに出すので、見出しには出さない。右クリックは呼ぶ側の「チャットの画面」のメニュー（useChatDisplayMenu の onBlank）
 */
export function ChatHeaderFrame({
  badges,
  title,
  tools,
  end,
  onContextMenu,
  children,
}: {
  badges: ReactNode;
  title?: ReactNode;
  tools: ReactNode;
  end?: ReactNode;
  onContextMenu: (e: MouseEvent) => void;
  /** 行の下に置くもの（浮かせた検索の欄・メニュー） */
  children?: ReactNode;
}) {
  const badgeColors = useChatHeaderBadgeColors();
  return (
    <header className="chat-header" onContextMenu={onContextMenu}>
      <div className="chat-title-row">
        <span className={cx("chat-sub muted small", !badgeColors && "plain-badges")}>{badges}</span>
        {title}
        <span className="spacer" />
        <span className="chat-tools">{tools}</span>
        {end}
      </div>
      {children}
    </header>
  );
}
