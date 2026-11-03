import type { DatabaseSync } from "node:sqlite";
import type { QueuedMessage } from "../types.js";
import { bit } from "./common.js";

/** 保存した送信待ちの列（チャットごと） */
export interface SavedQueue {
  runId: number;
  messages: QueuedMessage[];
  paused: boolean;
  /** 「ここまで自動で送る」の印を付けた指示（列の中のいくつでも） */
  stopAfter: string[];
}

/**
 * 「ここまで」の印の保存の形（stop_after の列）。印が 1 つなら指示の ID そのまま（印が 1 つしか付けられなかったころと同じ形）、
 * 2 つ以上なら ID の JSON の配列。ID は UUID なので "[" では始まらない
 */
export function encodeStops(ids: string[]): string | null {
  return ids.length === 0 ? null : ids.length === 1 ? ids[0] : JSON.stringify(ids);
}

export function decodeStops(raw: string | null): string[] {
  if (!raw) return [];
  if (!raw.startsWith("[")) return [raw];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 送信待ちの指示の保存（followups.ts の FollowupQueue が、変わるたびに丸ごと書く。画面への知らせは FollowupQueue が出す） */
export function createQueueStore(db: DatabaseSync) {
  return {
    /** 保存したすべての列（起動したときに読み戻す。壊れた行は読み飛ばす） */
    list(): SavedQueue[] {
      const rows = db.prepare("SELECT run_id, messages, paused, stop_after FROM run_queues").all() as {
        run_id: number;
        messages: string;
        paused: number;
        stop_after: string | null;
      }[];
      return rows.flatMap((row) => {
        const messages = JSON.parse(row.messages) as unknown;
        if (!Array.isArray(messages) || messages.length === 0) return [];
        return [{ runId: row.run_id, messages: messages as QueuedMessage[], paused: row.paused === 1, stopAfter: decodeStops(row.stop_after) }];
      });
    },
    /** 列を丸ごと書く（空なら消す。もうないチャットの列は書かない） */
    save(queue: SavedQueue) {
      if (queue.messages.length === 0) {
        db.prepare("DELETE FROM run_queues WHERE run_id = ?").run(queue.runId);
        return;
      }
      db.prepare(
        `INSERT INTO run_queues (run_id, messages, paused, stop_after)
         SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM runs WHERE id = ?)
         ON CONFLICT (run_id) DO UPDATE SET messages = excluded.messages, paused = excluded.paused, stop_after = excluded.stop_after`,
      ).run(queue.runId, JSON.stringify(queue.messages), bit(queue.paused), encodeStops(queue.stopAfter), queue.runId);
    },
  };
}
