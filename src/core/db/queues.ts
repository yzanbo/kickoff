import type { DatabaseSync } from "node:sqlite";
import type { QueuedMessage } from "@shared/types";
import { decodeStops, encodeStops } from "@shared/chat/queueStops";
import { bit } from "./common.js";

/** 保存した送信待ちの列（チャットごと） */
export interface SavedQueue {
  chatId: number;
  messages: QueuedMessage[];
  paused: boolean;
  /** 「ここまで送ったら止めます」の印の位置（0 = 1 件目の上、n = n 件目のあと） */
  stops: number[];
}

/** 送信待ちの指示の保存（queue.ts の FollowupQueue が、変わるたびに丸ごと書く。画面への知らせは FollowupQueue が出す） */
export function createQueueStore(db: DatabaseSync) {
  return {
    /** 保存したすべての列（起動したときに読み戻す。壊れた行は読み飛ばす。すべて送ったあとの印だけが残った空の列も読む） */
    list(): SavedQueue[] {
      const rows = db.prepare("SELECT chat_id, messages, paused, stop_after FROM chat_queues").all() as {
        chat_id: number;
        messages: string;
        paused: number;
        stop_after: string | null;
      }[];
      return rows.flatMap((row) => {
        const messages = JSON.parse(row.messages) as unknown;
        if (!Array.isArray(messages)) return [];
        const stops = decodeStops(row.stop_after, messages as QueuedMessage[]);
        if (messages.length === 0 && stops.length === 0) return [];
        return [{ chatId: row.chat_id, messages: messages as QueuedMessage[], paused: row.paused === 1, stops }];
      });
    },
    /**
     * 列を丸ごと書く（指示も印もなければ消す。もうないチャットの列は書かない）。
     * すべて送ったあとの印（次に来た指示の前で止める）は、列が空でも残す（再起動しても止まる所を覚えておく）
     */
    save(queue: SavedQueue) {
      if (queue.messages.length === 0 && queue.stops.length === 0) {
        db.prepare("DELETE FROM chat_queues WHERE chat_id = ?").run(queue.chatId);
        return;
      }
      db.prepare(
        `INSERT INTO chat_queues (chat_id, messages, paused, stop_after)
         SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM chats WHERE id = ?)
         ON CONFLICT (chat_id) DO UPDATE SET messages = excluded.messages, paused = excluded.paused, stop_after = excluded.stop_after`,
      ).run(queue.chatId, JSON.stringify(queue.messages), bit(queue.paused), encodeStops(queue.stops), queue.chatId);
    },
  };
}
