import type { DatabaseSync } from "node:sqlite";
import type { QueuedMessage } from "@shared/chat/types";
import type { Outbox } from "@shared/chat/outbox";
import { bit } from "@/foundation/core/db/common";

/** 出す箱の保存（chat_outbox の表。ChatRun が、変わるたびに丸ごと書く。画面への知らせは殻が出す） */
export function createOutboxStore(db: DatabaseSync) {
  const fromRow = (row: { now: string; later: string; stops: string; paused: number }): Outbox => ({
    now: JSON.parse(row.now) as QueuedMessage[],
    later: JSON.parse(row.later) as QueuedMessage[],
    stops: JSON.parse(row.stops) as number[],
    paused: row.paused === 1,
  });
  return {
    /** 保存したすべての箱（起動したときに読み戻す。すべて送ったあとの線だけが残った空の送信待ちも読む） */
    list(): { chatId: number; box: Outbox }[] {
      const rows = db.prepare("SELECT chat_id, now, later, stops, paused FROM chat_outbox").all() as { chat_id: number; now: string; later: string; stops: string; paused: number }[];
      return rows.map((row) => ({ chatId: row.chat_id, box: fromRow(row) }));
    },
    /** 1 つのチャットの保存した箱（なければ undefined） */
    get(chatId: number): Outbox | undefined {
      const row = db.prepare("SELECT now, later, stops, paused FROM chat_outbox WHERE chat_id = ?").get(chatId) as { now: string; later: string; stops: string; paused: number } | undefined;
      return row && fromRow(row);
    },
    /**
     * 箱を丸ごと書く（行も線もなければ消す。もうないチャットの箱は書かない）。
     * すべて送ったあとの線（次に来た指示の前で止める）は、送信待ちが空でも残す（再起動しても止まる所を覚えておく）
     */
    save(chatId: number, box: Outbox) {
      if (box.now.length === 0 && box.later.length === 0 && box.stops.length === 0) {
        db.prepare("DELETE FROM chat_outbox WHERE chat_id = ?").run(chatId);
        return;
      }
      db.prepare(
        `INSERT INTO chat_outbox (chat_id, now, later, stops, paused)
         SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM chats WHERE id = ?)
         ON CONFLICT (chat_id) DO UPDATE SET now = excluded.now, later = excluded.later, stops = excluded.stops, paused = excluded.paused`,
      ).run(chatId, JSON.stringify(box.now), JSON.stringify(box.later), JSON.stringify(box.stops), bit(box.paused), chatId);
    },
  };
}
