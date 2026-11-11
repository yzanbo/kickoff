import { MessagesSquare } from "lucide-react";
import { useChatStates } from "@/app/chatStatesContext";
import { useChildChats } from "@/stores/chats";
import { childActivityOf } from "./childChats";

/**
 * タブの名前の後ろに添える、子孫の子チャットの動きの印（子チャットのマーク・作業中のリング（回答待ちなら琥珀色）・件数）。
 * 親のタブを見るだけで、裏で子チャット（孫も）が動いていることが分かるようにする（利用者の依頼）。作業中・回答待ちの子孫がなければ出さない
 */
export function ChildActivityMark({ chatId }: { chatId: number }) {
  const childrenOf = useChildChats();
  const { stateOf } = useChatStates();
  const activity = childActivityOf(chatId, childrenOf, stateOf);
  if (!activity) return null;
  const label = `子チャットが${activity.state === "needs_input" ? "回答待ち・作業中" : "作業中"}（${activity.count} 件）`;
  return (
    <span className={`tab-child-activity state-${activity.state}`} title={label} aria-label={label} role="img">
      <MessagesSquare size={11} aria-hidden />
      {activity.state === "running" ? <span className="status-ring" /> : <span className="tab-child-activity-alert">!</span>}
      {activity.count > 1 && <span className="tab-child-activity-count">{activity.count}</span>}
    </span>
  );
}
