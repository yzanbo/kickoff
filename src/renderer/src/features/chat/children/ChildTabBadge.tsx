import { childDepthLabel, childDepthShort } from "@shared/chat/childDepth";
import { knownChat, useChatsValue, useKnownChat } from "@/stores/chats";
import { ancestorsOf } from "./childChats";

/**
 * 子チャットのタブの種類の札の文: 深さで「子 / 孫 / ひ孫」（`childDepthShort`）。孫・ひ孫も同じ欄に子と並ぶので見分ける。
 * 札と下線の色は、印の class（.child-depth-mark-<n>）を見て CSS が深さの色にする（panel/side-panel-tab-kinds.css）。親が読み込んだ一覧になければ子
 */
export function ChildTabBadge({ tab }: { tab: { childId: number } }) {
  const chat = useKnownChat(tab.childId);
  const depth = Math.max(useChatsValue(() => (chat ? ancestorsOf(chat, knownChat).length : 0)) ?? 0, 1);
  return (
    <span className={`child-depth-mark-${Math.min(depth, 3)}`} data-tip={childDepthLabel(depth)}>
      {childDepthShort(depth)}
    </span>
  );
}
