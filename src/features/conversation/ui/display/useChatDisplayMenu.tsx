import type { MouseEvent } from "react";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { ChatDisplayItems } from "./ChatDisplayMenu";

/** 何もないところとみなさない所（そのものの右クリックを残す: ボタン・リンク・開閉の見出し・入力欄・検索の欄） */
const NOT_BLANK = "button, a, summary, input, textarea, select, [role='search']";

/**
 * 何もないところの右クリックで開く「チャットの画面」のメニュー（タブの列・見出しの行など。隠したものをここから戻せる）。
 * 見出し・会話の流れ・送る前のチャットの枠で同じもの。onBlank を右クリックに渡し、element をどこかに描く
 */
export function useChatDisplayMenu() {
  const menu = useContextMenu();
  return {
    /** 何もないところかを確かめずに開く（流れの返答の行の文の外など、呼ぶ側が決めたとき） */
    open: (e: MouseEvent) => menu.open(e),
    /** 何もないところなら開く */
    onBlank: (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(NOT_BLANK)) return;
      menu.open(e);
    },
    element: menu.menu && (
      <PopupMenu at={menu.menu.at} label="チャットの画面" onClose={menu.close}>
        <ChatDisplayItems />
      </PopupMenu>
    ),
  };
}
