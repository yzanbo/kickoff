// 送信待ちの指示を、子チャットで聞く（右クリックのメニュー。会話を引き継ぐ / 新しく始めるを選んで子チャットを作って送り、設定の「子チャットを作ったとき」で開く）
import type { ChatOptionsPatch, QueuedMessage } from "@shared/types";
import { api } from "@/api";
import { knownChat } from "@/stores/chats";
import { reportFailure } from "@/ui/dialogs";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { openCreatedChild } from "@/features/chat/children/openChild";
import { seedOf } from "./askInNewChat";

/**
 * 送信待ちの指示を子チャットで聞く操作（enabled でなければ undefined で、メニューに出さない。メモのチャット・アーカイブ済みでは作れない）。
 * 選んだ指示の文（列の順に空行でつなぐ）と添付で子チャットを作ってすぐ送り（inherit なら、このチャットの会話を引き継ぐ。チャット欄の「子チャットに送る」と同じ）、
 * 設定の「子チャットを作ったとき」（右の欄 / 別ウィンドウ / 開かない）で開く。選択（モデルなど）は、このチャットのいまの選択に 1 件目の指示の選択を重ねたもの
 * （送信待ちの指示の選択は、このチャットで送るときに重ねる差分なので、子チャットでも同じに送る。渡さないと既定の選択になる）。
 * remove: 送信待ちから外す（子チャットへ移す）/ 外さない（このチャットでも、このあと送る）
 */
export function useAskInChildChat(queue: QueuedMessage[], enabled: boolean) {
  const { chatId } = useChatPane();
  if (!enabled) return undefined;
  return (ids: string[], remove: boolean, inherit: boolean) => {
    const seed = seedOf(queue, ids);
    const parent = knownChat(chatId);
    const base: ChatOptionsPatch = parent ? { model: parent.model, effort: parent.effort, permission_mode: parent.permission_mode, fast_mode: parent.fast_mode } : {};
    const options = { ...base, ...queue.find((m) => m.id === ids[0])?.options };
    const run = async () => {
      const child = await api.createChildChat(chatId, { ...seed, quote: null, inherit, event_id: null, options });
      openCreatedChild(child);
      if (remove) await (ids.length === 1 ? api.removeQueued(chatId, ids[0]) : api.removeQueuedMany(chatId, ids));
    };
    void run().catch(reportFailure(remove ? "子チャットに移せませんでした" : "子チャットで開けませんでした"));
  };
}
