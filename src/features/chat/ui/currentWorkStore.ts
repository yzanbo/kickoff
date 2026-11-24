import { onServerEvent } from "@/foundation/ui/api/events";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";
import { describeActivity } from "./currentWork";

// チャットごとの、いまの作業（直近の記録から作った短い文）。読み込まずに知らせだけで作り、作業が終わったら消す
const activities = createKeyedStore<number, string>();

/** サーバーの知らせから、いまの作業を作り始める（起動のときに app/renderer/main.tsx が 1 回。返した関数でやめる） */
export function startCurrentWork(): () => void {
  const offs = [
    onServerEvent("chat_event", (e) => {
      const text = describeActivity(e.event);
      if (text && activities.get(e.event.chat_id).data !== text) activities.set(e.event.chat_id, text);
    }),
    onServerEvent("chat", (e) => {
      if (e.chat.status !== "running") activities.drop(e.chat.id);
    }),
  ];
  return () => offs.forEach((off) => off());
}

/** 作業中のチャットの、いまの作業（ファイルの編集・コマンドの実行など。まだ分からなければ null） */
export function useChatActivity(chatId: number): string | null {
  return useKeyedStore(activities, chatId, { active: false }).data ?? null;
}
