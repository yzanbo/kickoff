import type { Attachment, BackgroundState } from "@shared/types";
import { api } from "@/api";
import { queueModeTexts, useQueueMode } from "@/features/chat/composer/QueueModeToggle";
import type { QueueSendMode } from "@/features/chat/composer/composerKeys";
import type { ChatOptionsState } from "@/features/chat/options/ChatOptionsBar";
import { confirmStopAgents } from "@/features/chat/status/backgroundLabel";
import type { TimelineScroll } from "@/features/chat/timeline/timelineScroll";

/**
 * このチャットへの送り方（チャット欄の送信・作業中の送信・中断）。送ったら一番下に付いていく。
 * 作業中に送ったときの扱いは、チャット欄の切り替え（いま / あとで。どのチャットでも同じ）か、キー（⌘Enter = いま・⌘⇧Enter = あとで）で決める。
 * 中断は、裏で動いているサブエージェント・コマンドも止まることを確かめてから（onStopping: 押してから止まるまでの「停止中」）
 */
export function useChatSend({
  chatId,
  busy,
  queued,
  options,
  scroll,
  background,
  runningAgents,
  onStopping,
}: {
  chatId: number;
  busy: boolean;
  /** 送信待ちがあるか（作業していなくても、送り方を選ぶ） */
  queued: boolean;
  options: ChatOptionsState;
  scroll: TimelineScroll;
  background: BackgroundState | null;
  /** 裏で動いているサブエージェントの数（一覧の知らせがない古い Claude Code のとき、一覧の行から数えたもの） */
  runningAgents: number;
  onStopping: (stopping: boolean) => void;
}) {
  const [queueMode, setQueueMode] = useQueueMode();
  const texts = queueModeTexts(busy, queued, queueMode);
  return {
    queueMode,
    setQueueMode,
    placeholder: texts.placeholder,
    sendLabel: texts.sendLabel,
    onSend: async (text: string, attachments: Attachment[]) => {
      scroll.follow();
      await api.sendMessage(chatId, text, options.options, attachments);
    },
    onQueue: async (text: string, attachments: Attachment[], mode: QueueSendMode = queueMode) => {
      // 伝える: 止めずに、いまのやり取りに足す（裏のサブエージェント・コマンドも動き続ける。足せなければ待ちの列へ）。
      // ⌘Enter / ⌘⇧Enter で送ったときは、切り替えに関係なくそのキーの送り方にする
      // 作業していない（送信待ちを止めている）とき: すぐ送る = 送信待ちより先にいま送る / ためておく = 送信待ちの最後に足す
      if (!busy) {
        if (mode === "queue") return void (await api.queueMessage(chatId, text, options.options, attachments, true));
        scroll.follow();
        return void (await api.sendMessage(chatId, text, options.options, attachments));
      }
      scroll.follow();
      if (mode === "tell") await api.tellChat(chatId, text, options.options, attachments);
      else await api.queueMessage(chatId, text, options.options, attachments);
    },
    onStop: () =>
      void confirmStopAgents(background, runningAgents, "中断する").then((ok) => {
        if (!ok) return;
        onStopping(true);
        void api.cancelChat(chatId).catch(() => onStopping(false));
      }),
  };
}
