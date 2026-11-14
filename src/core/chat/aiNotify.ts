// チャットの AI が利用者に知らせる（kickoff_chat の notify_user の中身。プロバイダーに依らない。メモの仕様書「0019_AI の操作ツールの追加」の C）。
// 長い作業の途中で「ここまで済んだ」「この判断はあとで見てほしい」を届ける。送るかは通知の中心（notifications/center.ts）が決める
// （そのチャットを見ている人には送らない・この Mac の通知は設定のとおり・スマホのプッシュには本文を載せない）。ここは確かめて、記録に残して、バスに知らせるだけ
import { AI_NOTIFY_MESSAGE_MAX, AI_NOTIFY_PER_TURN, aiNoticeLine } from "@shared/chat/aiNotify";
import type { BusEvent } from "@shared/types";
import type { Store } from "../db/store.js";

/** 利用者に知らせるツールの中身（知らせたら AI に返す文。できなければ理由の文で throw） */
export interface AiNotifyTools {
  notify(input: { message: string }): string;
}

/** chatId のチャットの AI に渡す、利用者に知らせるツールの中身（作業ごとに作るので、回数はこの中で数える） */
export function createAiNotifyTools(deps: { store: Store; publish: (event: BusEvent) => void }, chatId: number): AiNotifyTools {
  let sent = 0;
  return {
    notify({ message }) {
      const text = message.replace(/\s+/g, " ").trim();
      if (!text) throw new Error("知らせる文（message）が空です");
      if ([...text].length > AI_NOTIFY_MESSAGE_MAX) throw new Error(`知らせる文は ${AI_NOTIFY_MESSAGE_MAX} 文字までです（いま ${[...text].length} 文字）。短くしてください`);
      if (sent >= AI_NOTIFY_PER_TURN) throw new Error(`1 回の作業で知らせられるのは ${AI_NOTIFY_PER_TURN} 回までです。残りは作業の終わりの返答に書いてください（終わりは Kickoff が自動で知らせます）`);
      const chat = deps.store.chats.get(chatId);
      if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
      sent++;
      deps.store.events.add(chatId, { type: "notice", message: aiNoticeLine(text) });
      deps.publish({ type: "ai_notice", project_id: chat.project_id, chat_id: chatId, message: text });
      return `利用者に知らせました（この Mac の通知とスマホのプッシュ。このチャットを見ている人には送りません）。この作業で知らせられるのはあと ${AI_NOTIFY_PER_TURN - sent} 回です。作業はそのまま続けてください。`;
    },
  };
}
