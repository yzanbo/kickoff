import { MessagesSquare } from "lucide-react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useChatStates } from "@/app/chatStatesContext";
import { useChildChats } from "@/stores/chats";
import { usePopover } from "@/ui/Popover";
import { childActivityOf } from "./childChats";
import { TabChildChatsPopover } from "./TabChildChatsPopover";

/**
 * タブの名前の後ろに添える、子孫の子チャットの印（子チャットのマーク・作業中のリング（回答待ちなら琥珀色の「!」）・件数）。
 * 親のタブを見るだけで、子チャット（孫も）があること・裏で動いていることが分かるようにする（利用者の依頼）。
 * moving: 作業中・回答待ちの子孫を色付きで出す（「タブに出す項目」の「状態」）。always: 動いていなくても子チャットがあれば、子チャットのマークと数を薄く出す（「子チャット」）。
 * 押すと子チャットの一覧（TabChildChatsPopover）を開き、選んだ子チャットを親の右の欄に開く（利用者の依頼）。タブの名前のボタンの中にあるので、
 * ボタンを入れ子にせず role="button" の span にし、押してもタブを選ばない（stopPropagation）
 */
export function ChildActivityMark({ chatId, moving, always }: { chatId: number; moving: boolean; always: boolean }) {
  const childrenOf = useChildChats();
  const { stateOf } = useChatStates();
  const popover = usePopover<HTMLSpanElement>();
  const activity = childActivityOf(chatId, childrenOf, stateOf);
  if (!activity) return null;
  const { state, count, total } = activity;
  const busy = moving && state !== "idle";
  if (!busy && !always) return null;
  const label = busy ? `子チャットが${state === "needs_input" ? "回答待ち・作業中" : "作業中"}（${count} 件。子チャットは全部で ${total} 件）` : `子チャット ${total} 件`;
  const content: ReactNode = busy ? (
    <>
      <MessagesSquare size={11} aria-hidden />
      {state === "running" ? <span className="status-ring" /> : <span className="tab-child-activity-alert">!</span>}
      {count > 1 && <span className="tab-child-activity-count">{count}</span>}
    </>
  ) : (
    <>
      <MessagesSquare size={11} aria-hidden />
      <span className="tab-child-activity-count">{total}</span>
    </>
  );
  const toggle = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    popover.toggle();
  };
  return (
    <>
      <span
        ref={popover.anchor}
        className={`tab-child-activity state-${busy ? state : "idle"}`}
        title={`${label}。押すと子チャットを一覧する`}
        aria-label={`${label}。子チャットを一覧する`}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        onClick={toggle}
        // タブのドラッグ・タブを選ぶ動きを始めない
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(e)}
      >
        {content}
      </span>
      {popover.open && (
        // 一覧は body に出すが、React の上ではタブの名前のボタンの中にあるので、中のクリック・キーがタブを選ぶ・名前を変えるに届かないよう止める
        // （Esc は一覧を閉じる useDismiss が window で受けるので止めない）
        <span
          className="tab-child-chats-scope"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
        >
          <TabChildChatsPopover chatId={chatId} anchor={popover.anchor} onClose={popover.close} />
        </span>
      )}
    </>
  );
}
