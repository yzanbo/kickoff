import type { Chat } from "@shared/types";
import { clampToViewport, PopupMenu } from "@/ui/PopupMenu";
import { ChatMenuItems } from "./ChatMenuItems";

/** メニューの幅（menu.css の .menu の min-width と同じ。項目が短いのでこの幅で出る。ボタンの右端にそろえて出すときに使う） */
export const CARD_MENU_WIDTH = 200;

/** チャットの右クリックメニュー（カンバンのカード・グループのボード・サイドバー）。項目はパネルのタブと共通の ChatMenuItems */
export function ChatMenu({
  x,
  y,
  chat,
  onOpenPanel,
  onRename,
  onClose,
  onError,
  ignore,
}: {
  x: number;
  y: number;
  chat: Chat;
  onOpenPanel: (chat: Chat) => void;
  /** 名前をその場で変え始める（カード・行の名前を入力欄にする） */
  onRename: (chat: Chat) => void;
  onClose: () => void;
  onError: (message: string) => void;
  /** 押しても外側のクリックとして閉じない要素（メニューを開くボタン。開閉はそちらで行う） */
  ignore?: string;
}) {
  // 「プロジェクトを移動」で中身が長くなっても収まるよう、高さは多めに見る
  const at = clampToViewport(x, y, CARD_MENU_WIDTH, 330);
  return (
    <PopupMenu x={at.x} y={at.y} escape="pass" ignore={ignore} onClose={onClose}>
      <ChatMenuItems chat={chat} onOpen={onOpenPanel} onRename={onRename} onClose={onClose} onError={onError} />
    </PopupMenu>
  );
}
