import type { DatabaseSync } from "node:sqlite";
import type { QueuedMessage } from "@shared/types";
import { bit } from "./common.js";

/** 保存した送信待ちの列（チャットごと） */
export interface SavedQueue {
  chatId: number;
  messages: QueuedMessage[];
  paused: boolean;
  /** 一時停止の印の位置（0 = 1 件目の上、n = n 件目のあと） */
  stops: number[];
}

/** 送信待ちの指示の保存（chat_queues の表。chat/queue.ts の ChatQueue が、変わるたびに丸ごと書く。画面への知らせは ChatRuntime が出す） */
export function createQueueStore(db: DatabaseSync) {
  return {
    /** 保存したすべての列（起動したときに読み戻す。すべて送ったあとの印だけが残った空の列も読む） */
    list(): SavedQueue[] {
      const rows = db.prepare("SELECT chat_id, messages, paused, stops FROM chat_queues").all() as { chat_id: number; messages: string; paused: number; stops: string }[];
      return rows.map((row) => ({ chatId: row.chat_id, messages: JSON.parse(row.messages), paused: row.paused === 1, stops: JSON.parse(row.stops) }));
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
        `INSERT INTO chat_queues (chat_id, messages, paused, stops)
         SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM chats WHERE id = ?)
         ON CONFLICT (chat_id) DO UPDATE SET messages = excluded.messages, paused = excluded.paused, stops = excluded.stops`,
      ).run(queue.chatId, JSON.stringify(queue.messages), bit(queue.paused), JSON.stringify(queue.stops), queue.chatId);
    },
  };
}
