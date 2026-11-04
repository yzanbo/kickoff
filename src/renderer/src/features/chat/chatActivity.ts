import { subscribeServerEvent } from "@/api/events";
import { createKeyedStore } from "@/stores/keyedStore";
import { useKeyedStore } from "@/stores/useStore";
import { describeActivity } from "./activity";

// チャットごとの、いまの作業（直近の記録から作った短い文）。読み込まずに知らせだけで作り、作業が終わったら消す
const activities = createKeyedStore<number, string>();

subscribeServerEvent((e) => {
  if (e.type === "chat_event") {
    const text = describeActivity(e.event);
    if (text && activities.get(e.event.chat_id).data !== text) activities.set(e.event.chat_id, text);
  } else if (e.type === "chat" && e.chat.status !== "running") {
    activities.drop(e.chat.id);
  }
});

/** 作業中のチャットの、いまの作業（ファイルの編集・コマンドの実行など。まだ分からなければ null） */
export function useChatActivity(chatId: number): string | null {
  return useKeyedStore(activities, chatId, { active: false }).data ?? null;
}
