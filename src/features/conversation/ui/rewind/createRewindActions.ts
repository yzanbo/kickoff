// 書き直し・送り直し・ファイルを戻す・再試行の口（RewindActions）の実装。チャットの画面がチャットごとに 1 回だけ作り、選択と送り方を描くたびに入れ直す
import type { Attachment } from "@shared/chat/types";
import { turnsApi } from "@/features/chat/ui";
import { createCell } from "@/foundation/ui/store";
import { reportFailure } from "@/foundation/ui/kit/ask";
import type { ChatOptionsState } from "@/features/ai/ui";
import { SendCancelled } from "@/features/composer/ui";
import { confirmRewindSend, restoreFilesBefore } from "./rewindActions";
import type { RetryChoices, RewindActions } from "@/features/conversation/ui/rewindContext";
import { retryTurn } from "./useRetryChoices";

/** 描くたびに入れる、いまの選択と送り方 */
export interface RewindSend {
  options: ChatOptionsState;
  /** 入力欄の文ではないものを送る（入力欄と同じ送り方。出どころは付けない） */
  sendOther: (text: string, attachments: Attachment[]) => Promise<void>;
}

export interface RewindParts {
  actions: RewindActions;
  setSend: (send: RewindSend) => void;
}

/** follow: 書き直して送るとき、流れの一番下に付いていく */
export function createRewindActions(chatId: number, follow: () => void): RewindParts {
  let current: RewindSend | null = null;
  const now = () => current!;
  const actions: RewindActions = {
    rewind: async (eventId, text) => {
      const choice = await confirmRewindSend(chatId, eventId);
      if (!choice) return false;
      follow();
      await turnsApi.rewindChat(chatId, eventId, text, now().options.options, choice.restoreFiles);
      return true;
    },
    resend: async (text, attachments) => {
      try {
        // 入力欄の文ではないので、入力欄の子チャットからの依頼の出どころは付けない
        await now().sendOther(text, attachments);
      } catch (e) {
        // 送る前の確かめでやめたときは、何も出さない
        if (!(e instanceof SendCancelled)) void reportFailure("もう一度送れませんでした")(e);
      }
    },
    restoreFiles: (eventId) => restoreFilesBefore(chatId, eventId),
    retry: (change) => retryTurn(chatId, now().options, change),
    choices: createCell<RetryChoices | null>(null),
  };
  return {
    actions,
    setSend: (send) => {
      current = send;
    },
  };
}
