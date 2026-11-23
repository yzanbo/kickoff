import type { RunShell } from "./shell";
import { queueStateOf } from "@/features/chat/core/live";
import type { QueueCommand } from "@shared/chat/queueCommand";
import type { Chat } from "@shared/chat/types";
import type { QueueState } from "@shared/chat/chatLive";
import type { QueueSendBody, SendBody, SendResult } from "@shared/chat/send";
import { marksOf } from "@shared/chat/handoff";
import type { Lane, RunEvent } from "@/features/chat/core/run/machine/types";

/**
 * 送る・伝える・送信待ち（チャットごとの出す箱の later）と預かり（now）の窓口。どの操作も出来事にして殻の dispatch に渡すだけ
 * （決まりは machine の step。列の出し入れは @shared/chat/outbox・queueCommand の純粋な関数）。
 * できなければ失敗の種類の例外を投げる（列にない指示は 404・送るものがないなどの状態は 409・入力は 400。@/foundation/core/errors）
 */
export function queueWindow(shell: RunShell) {
  const boxOf = (chatId: number) => shell.runs.get(chatId).outbox;
  /** 送る口 1 本（when: now = 止めずに伝える / later = 作業中なら送信待ちへ / 省けば作業中は 409。決まりは step の send）。送った結果と、そのあとのチャット・送信待ち */
  const message = async (chatId: number, body: SendBody): Promise<SendResult & { id: string | null }> => {
    shell.requireChat(chatId);
    const sent = { text: body.text ?? "", options: body.options ?? {}, attachments: body.attachments ?? [], marks: marksOf(body) };
    const done = shell.run(chatId, { type: "send", when: body.when ?? "idle", message: sent, pauseAfter: body.pause_after ?? false, hold: body.hold ?? false });
    const reply = done.effects.find((e) => e.do === "reply");
    const result = await shell.answer(chatId, done);
    return { result, chat: shell.requireChat(chatId), queue: queueStateOf(shell.runs.get(chatId)), id: reply?.result === "queued" ? reply.id : null };
  };
  return {
    message,

    /** 送信待ちを変える命令の列（全部通るか、1 つも変えない。並び・線が変わって次を送ったら、送る準備が済むまで待つ）。そのあとの送信待ち */
    async queue(chatId: number, commands: QueueCommand[]): Promise<QueueState> {
      shell.requireChat(chatId);
      await shell.answer(chatId, shell.run(chatId, { type: "queue", commands }));
      return queueStateOf(shell.runs.get(chatId));
    },

    /** 送信待ちをすぐ送る（now = その 1 件・all = まとめて 1 件に・in_order = 1 件ずつ順に）。そのあとの送信待ち */
    async queueSend(chatId: number, body: QueueSendBody): Promise<QueueState> {
      shell.requireChat(chatId);
      const event: RunEvent = body.mode === "now" ? { type: "queue_send", mode: "now", id: body.ids[0] } : body.mode === "all" ? { type: "queue_send", mode: "all", ...(body.ids ? { ids: body.ids } : {}) } : { type: "queue_send", mode: "in_order" };
      await shell.answer(chatId, shell.run(chatId, event));
      return queueStateOf(shell.runs.get(chatId));
    },

    /** 画面で書き直している行を丸ごと置き換える（空なら外す。開いている間、画面は持ち時間 EDIT_HOLD_TTL_MS より短い間隔で知らせ直す）。そのあとの送信待ち */
    editing(chatId: number, lane: Lane, ids: string[]): QueueState {
      shell.dispatch(chatId, { type: "editing", lane, ids });
      return queueStateOf(shell.runs.get(chatId));
    },

    /** 送信待ちの様子（チャットの詳細・SSE の chat_live・送信待ちを変える API の応答で同じ形） */
    queueState: (chatId: number) => queueStateOf(shell.runs.get(chatId)),

    /** 待ちの指示をすべて消す（消した数を返す） */
    clearQueued(chatId: number): number {
      const count = boxOf(chatId).later.length;
      shell.run(chatId, { type: "queue", commands: [{ op: "clear" }] });
      return count;
    },

    /**
     * 会話を要約して、コンテキストを空ける（Claude Code の /compact を手で実行する）。会話の記録には発言として残さず、要約したこと（compact イベント）だけが残る。
     * 作業中なら、圧縮前指示をいまの作業に足すか、予約する（送信待ちのいちばん上に圧縮の行）。圧縮前指示があれば、先にその指示を送り、その作業が最後まで終わってから圧縮する
     */
    async compact(chatId: number): Promise<Chat> {
      shell.requireChat(chatId);
      await Promise.all(shell.run(chatId, { type: "compact" }).started);
      return shell.requireChat(chatId);
    },

    /** 手でコンテキストを消去する: 作業していなければその場で消去し、送信待ちがあれば次を送る。作業中なら、いまのやり取りが終わったらすぐ消去する予約 */
    clear(chatId: number): Chat {
      shell.requireChat(chatId);
      shell.run(chatId, { type: "clear", pump: true });
      return shell.requireChat(chatId);
    },

    /** つながったら自動で再開するのをやめる（待っていなければ 409） */
    stopReconnect(chatId: number): void {
      shell.run(chatId, { type: "stop_reconnect" });
    },
  };
}
