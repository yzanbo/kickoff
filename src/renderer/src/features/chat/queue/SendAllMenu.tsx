import { ChevronDown, ListOrdered, Merge, SendHorizontal } from "lucide-react";
import { api } from "@/api";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { queueFailed as failed } from "./queueFailed";

/**
 * 送信待ちの「すべて送る」: 押すと、このチャットへの送り方を 2 つから選ぶ。
 * 「まとめて 1 件で送る」= 1 つの指示につなげていま送る / 「1 件ずつ順に送る」= 別々の指示として、終わるたびに次を送る。
 * 送信待ちはチャット欄のすぐ上（画面の下の方）にあるので、メニューはボタンの上に、右端をそろえて開く
 */
export function SendAllMenu({
  count,
  busy,
  holds,
}: {
  count: number;
  busy: boolean;
  /** 止めている・一時停止の印がある（1 件ずつ送るときは外して最後まで送る） */
  holds: boolean;
}) {
  const { chatId } = useChatPane();
  const menu = useContextMenu({ side: "above", align: "end" });
  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-primary queued-head-btn send-all-button"
        aria-label="すべて送る"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        title={`送信待ちの ${count} 件をすべて送る（まとめて 1 件で送るか、1 件ずつ順に送るかを選ぶ）`}
        onClick={menu.toggle}
      >
        <SendHorizontal size={12} aria-hidden />
        {/* 狭いときは文字を隠してアイコンだけにする（読み上げは aria-label） */}
        <span className="queued-head-label">すべて送る</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="送信待ちの送り方" className="send-all-menu" ignore=".send-all-button" onClose={menu.close}>
          <MenuItem onSelect={() => void api.sendAllQueued(chatId).catch(failed)}>
            <Merge size={14} aria-hidden />
            <span className="send-all-option">
              <span>まとめて 1 件で送る</span>
              <span className="send-all-note">
                {count} 件を 1 つの指示につなげて、いま送ります{busy ? "（作業は止めずに、いまのやり取りに足す）" : ""}
              </span>
            </span>
          </MenuItem>
          <MenuItem onSelect={() => void api.sendQueuedInOrder(chatId).catch(failed)}>
            <ListOrdered size={14} aria-hidden />
            <span className="send-all-option">
              <span>1 件ずつ順に送る</span>
              <span className="send-all-note">
                {busy ? "別々の指示として、いまの作業が終わったら 1 件ずつ順に送ります" : "別々の指示として、1 件目をいま送り、終わるたびに次を送ります"}
                {holds ? "（止めている設定・一時停止は外して最後まで）" : ""}
              </span>
            </span>
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
