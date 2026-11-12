import { MessagesSquare } from "lucide-react";
import { useChatStates } from "@/app/chatStatesContext";
import { useChildChats } from "@/stores/chats";
import { childActivityOf } from "./childChats";

/**
 * タブの名前の後ろに添える、子孫の子チャットの印（子チャットのマーク・作業中のリング（回答待ちなら琥珀色の「!」）・件数）。
 * 親のタブを見るだけで、子チャット（孫も）があること・裏で動いていることが分かるようにする（利用者の依頼）。
 * moving: 作業中・回答待ちの子孫を色付きで出す（「タブに出す項目」の「状態」）。always: 動いていなくても子チャットがあれば、子チャットのマークと数を薄く出す（「子チャット」）
 */
export function ChildActivityMark({ chatId, moving, always }: { chatId: number; moving: boolean; always: boolean }) {
  const childrenOf = useChildChats();
  const { stateOf } = useChatStates();
  const activity = childActivityOf(chatId, childrenOf, stateOf);
  if (!activity) return null;
  const { state, count, total } = activity;
  if (moving && state !== "idle") {
    const label = `子チャットが${state === "needs_input" ? "回答待ち・作業中" : "作業中"}（${count} 件。子チャットは全部で ${total} 件）`;
    return (
      <span className={`tab-child-activity state-${state}`} title={label} aria-label={label} role="img">
        <MessagesSquare size={11} aria-hidden />
        {state === "running" ? <span className="status-ring" /> : <span className="tab-child-activity-alert">!</span>}
        {count > 1 && <span className="tab-child-activity-count">{count}</span>}
      </span>
    );
  }
  if (!always) return null;
  const label = `子チャット ${total} 件`;
  return (
    <span className="tab-child-activity state-idle" title={label} aria-label={label} role="img">
      <MessagesSquare size={11} aria-hidden />
      <span className="tab-child-activity-count">{total}</span>
    </span>
  );
}
