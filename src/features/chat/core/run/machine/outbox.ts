// 出す箱の、送る前と作業の終わりの決まり（純粋）。行の出し入れそのものは @shared/chat/outbox
import { addLater, moveOne, newMessage, type Outbox, type OutboxEnv } from "@shared/chat/outbox";
import { isQueueAction } from "@shared/chat/queueActions";
import { marksOf } from "@shared/chat/handoff";
import type { QueuedMessage } from "@shared/chat/types";
import type { HandoffGate } from "./types";

/**
 * 引き継ぎの門が通すか（row を省けば、送ること自体）: 門がなければ通す。圧縮・消去の行は引き継ぎが終わるまで通さない
 * （引き継ぐ前にセッションを操作しない）。指示は引き継ぎの準備ができていれば通す
 */
export function handoffAllows(gate: HandoffGate, row?: QueuedMessage): boolean {
  if (gate === null) return true;
  if (row && isQueueAction(row)) return false;
  return gate === "ready";
}

/**
 * 作業が送れない終わり方（通信の切断・使用枠の上限・アプリの終了）をしたときに、預かりを置いておく: 自分の指示は送信待ちの頭へ
 * （前からの送信待ちより先・送った順・印も。新しい行として足す）。圧縮後指示は送信待ちに入れずに預かりに残し、次に送った作業にそのまま伝える
 */
export function parkNow(box: Outbox, env: OutboxEnv): Outbox {
  let next: Outbox = { ...box, now: box.now.filter((m) => m.post_compact) };
  box.now
    .filter((m) => !m.post_compact)
    .forEach((m, i) => {
      const item = newMessage(env, m.text, m.options, m.attachments, marksOf(m));
      const added = addLater(next, item);
      next = moveOne(added, item.id, i) ?? added;
    });
  return next;
}
