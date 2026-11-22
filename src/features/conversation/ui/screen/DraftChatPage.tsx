import { useContext, useId, useRef, type ReactNode } from "react";
import type { ProviderId } from "@shared/settings/types";
import { TabVisibleContext } from "@/features/panel/ui/tabs/tabPageContext";
import { cx } from "@/foundation/ui/lib/cx";
import { useChatHeaderItems, useChatHeaderRowHidden } from "./ChatDisplayMenu";
import { ChatHeaderFrame } from "./ChatHeaderFrame";
import { useChatDisplayMenu } from "./useChatDisplayMenu";
import { useForegroundProvider } from "./useForegroundProvider";
import { ChatFontSizeButton } from "./ChatFontSizeButton";
import { TextWidthToggle, useWideText } from "./TextWidthToggle";
import { useAppSettings } from "@/features/settings/ui";
import { RestrictionNotice } from "./RestrictionNotice";

/**
 * 送る前のチャット（新しいチャット・新しい子チャットのタブ）の画面の枠。チャットの画面（ChatPane・ChatHeader）と同じ決まりで描く:
 * 見出しの行（隠していれば出さない）・左にバッジ（badges。どれを出すかは呼ぶ側が useChatHeaderItems で決める）・右に道具・会話の横幅（.wide）・
 * 見出しと流れの何もないところの右クリックで「チャットの画面」のメニュー。
 * 道具は会話がなくても効くもの（会話の横幅・会話の文字の大きさ）だけを出す（会話 / 動き・指示の帯・検索・ターン数・右の欄の開閉は、会話ができてから）
 */
export function DraftChatPage({ provider, className, badges, hero, children }: { provider: ProviderId; className?: string; badges: ReactNode; hero: ReactNode; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const visible = useContext(TabVisibleContext);
  const draftKey = `draft:${useId()}`;
  // 初回送信を待たず、見出しで選んだ AI の使用状況を下の帯に出す。裏のタブでは上書きしない。
  const noteForeground = useForegroundProvider(provider, draftKey, visible);
  const [wide] = useWideText();
  const shows = useChatHeaderItems();
  const rowHidden = useChatHeaderRowHidden();
  const menu = useChatDisplayMenu();
  const settings = useAppSettings().data;
  return (
    <div
      ref={page}
      className={cx("chat-page chat-panel new-chat", wide && "wide", className)}
      onPointerDownCapture={noteForeground}
      onFocusCapture={noteForeground}
    >
      {rowHidden ? (
        <header className="chat-header collapsed" />
      ) : (
        <ChatHeaderFrame
          onContextMenu={menu.onBlank}
          badges={badges}
          tools={
            <>
              {shows("textWidth") && <TextWidthToggle panel={page} />}
              {shows("fontSize") && <ChatFontSizeButton />}
            </>
          }
        />
      )}
      <div className="timeline" onContextMenu={menu.onBlank}>
        {hero}
      </div>
      <div className="chat-composer">{settings ? <RestrictionNotice draft sandboxEnabled={settings.sandbox_enabled_by_default} editScopeEnabled={settings.edit_scope_enabled_by_default} /> : <p className="composer-notice small">制限の設定を読み込み中です。</p>}{children}</div>
      {menu.element}
    </div>
  );
}
