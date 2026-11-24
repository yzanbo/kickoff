import type { ChatEventOf } from "@shared/chat/chatEvent";
import { UserMessage } from "@/features/conversation/ui/messages/UserMessage";
import { createdChats } from "@/features/conversation/ui/timeline/selectors";

/**
 * 自分の発言の行。メインの流れ（main）なら、その作業で AI が作った兄弟チャット・親のないチャットの札も出す
 * （自分の分だけを読み、作ったチャットが変わらなければ描き直さない。サブエージェントの流れに混ぜた発言には出さない）
 */
export function UserRow({ event, main }: { event: ChatEventOf<"user">; main: boolean }) {
  const created = createdChats.useWith(event.chat_id, (byUser) => (main ? byUser.get(event.id) : undefined));
  return <UserMessage event={event} createdChats={created} />;
}
