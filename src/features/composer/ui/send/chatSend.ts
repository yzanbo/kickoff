import type { Attachment } from "@shared/chat/types";
import { api } from "@/foundation/ui/api";
import { queueModeTexts, useQueueMode } from "@/features/composer/ui/QueueModeToggle";
import type { SendWhen } from "@/features/composer/ui/composerKeys";
import type { ChatOptionsState } from "@/features/ai/ui/options/ChatOptionsBar";
import type { OutgoingMessage } from "../composerModel";
import { createChatSend, type HandBackFrom } from "./createChatSend";

/**
 * このチャットの送る口（入力欄・定型文の「すぐ送る」・質問として送る・中断）と、案内・送信ボタンの説明。
 * holdTexts は、コアが「いま」を預かる間（圧縮前指示から圧縮のあとのやり取りが終わるまで）の案内（「いま」を選んでいる作業中だけ出す）
 */
export function useChatSend({
  chatId,
  busy,
  queued,
  holdTexts,
  options,
  confirmStop,
  onStopping,
  beforeSend,
  afterSend,
  from,
}: {
  chatId: number;
  busy: boolean;
  queued: boolean;
  holdTexts: { placeholder: string; sendLabel?: string } | null;
  options: ChatOptionsState;
  confirmStop: () => Promise<boolean>;
  onStopping: (stopping: boolean) => void;
  beforeSend?: () => Promise<void>;
  afterSend?: () => void;
  from?: HandBackFrom;
}) {
  const [queueMode] = useQueueMode();
  const texts = busy && queueMode === "now" && holdTexts ? holdTexts : queueModeTexts(busy, queued, queueMode);
  const chatSend = createChatSend({
    busy,
    queued,
    mode: queueMode,
    options: options.options,
    send: (body) => api.sendMessage(chatId, body),
    cancel: () => api.cancelChat(chatId),
    confirmStop,
    onStopping,
    beforeSend,
    afterSend,
    from,
  });
  return {
    placeholder: texts.placeholder,
    sendLabel: texts.sendLabel,
    /** 入力欄から送る（子チャットからの依頼の出どころを付ける） */
    submit: (message: OutgoingMessage, mode?: SendWhen) => chatSend.submit(message, mode, { viaComposer: true }),
    /** 質問として送る（いまの送り方で送り、その指示の作業が終わったら送信待ちを一時停止する） */
    ask: (message: OutgoingMessage) => chatSend.submit(message, undefined, { asQuestion: true, viaComposer: true }),
    /** 入力欄の文ではないものを送る（定型文の帯の「すぐ送る」・「もう一度送る」。出どころは付けない） */
    sendOther: (text: string, attachments: Attachment[]) => chatSend.submit({ text, attachments }),
    stop: () => void chatSend.stop(),
  };
}
