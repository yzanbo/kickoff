import { Conflict, NotFound } from "@/foundation/core/errors";
import type { ChatRun } from "./chatRun";
import { rejection, type RunShell } from "./shell";
import { queueStateOf } from "@/features/chat/core/live";
import { applyQueueCommand, isQueueReject, type QueueCommand } from "@shared/chat/queueCommand";
import { queueActionOf } from "@shared/chat/queueActions";
import type { MessageMarks } from "@shared/chat/chatEvent";
import type { Attachment, QueueAction, QueuedMessage, Chat, ChatOptionsPatch } from "@shared/chat/types";
import type { QueueState } from "@shared/chat/chatLive";
import type { QueueSendBody, SendBody, SendResult, TellResult } from "@shared/chat/send";
import { marksOf } from "@shared/chat/handoff";
import type { Lane, RunEvent } from "@/features/chat/core/run/machine/types";

/** 送る・伝えるときの指定。pauseAfter: 質問として送る（この指示の作業が終わったら、送信待ちを自動で送らずに一時停止する） */
export interface SendOpts {
  pauseAfter?: boolean;
  /** 発言の印（依頼文の頼み・子チャットから渡した依頼）。発言の記録・送信待ちの行・預かりに同じ形で残す */
  marks?: MessageMarks;
}

/** 列にない指示を指したとき（消した・送ったあと） */
const missing = () => new NotFound("待ちの指示が見つかりません");

const TELLING = "圧縮のあとで順に伝えている途中です。少し待ってからやり直してください";

/**
 * 送る・伝える・送信待ち（チャットごとの出す箱の later）と預かり（now）の窓口。どの操作も出来事にして殻の dispatch に渡すだけ
 * （決まりは machine の step。列の出し入れは @shared/chat/outbox・queueCommand の純粋な関数）。
 * できなければ失敗の種類の例外を投げる（列にない指示は 404・送るものがないなどの状態は 409・入力は 400。@/foundation/core/errors）
 */
export function queueWindow(shell: RunShell) {
  const boxOf = (chatId: number) => shell.runs.get(chatId).outbox;
  /** 列を変える（命令を当てられなければ失敗の種類の例外。並び・線が変わって次を送ったら、送る準備が済むまで待つ） */
  const command = (chatId: number, cmd: QueueCommand): Promise<void> => shell.answer(chatId, shell.run(chatId, { type: "queue", commands: [cmd] })).then(() => {});
  /** 預かりの行（なければ 404 = もう伝えた） */
  const heldOf = (run: ChatRun, messageId: string): QueuedMessage => {
    const message = run.outbox.now.find((m) => m.id === messageId);
    if (!message) throw new NotFound("その指示は、もう伝えたか見つかりません");
    return message;
  };
  /** いまの作業に足している途中か（editing を渡せば、その行を書き直していれば数えない。足している途中に預かりを変えると、別の指示を飛ばしうる） */
  const telling = (run: ChatRun, editing?: string): boolean => {
    const { phase, editing: edits } = run.run;
    return phase.kind === "turn" && phase.telling !== null && !(editing !== undefined && edits.now.includes(editing));
  };
  /** 送る口 1 本（when: now = 止めずに伝える / later = 作業中なら送信待ちへ / 省けば作業中は 409。決まりは step の send）。送った結果と、そのあとのチャット・送信待ち */
  const message = async (chatId: number, body: SendBody): Promise<SendResult & { id: string | null }> => {
    shell.requireChat(chatId);
    const sent = { text: body.text ?? "", options: body.options ?? {}, attachments: body.attachments ?? [], marks: marksOf(body) };
    const done = shell.run(chatId, { type: "send", when: body.when ?? "idle", message: sent, pauseAfter: body.pause_after ?? false, hold: body.hold ?? false });
    const reply = done.effects.find((e) => e.do === "reply");
    const result = await shell.answer(chatId, done);
    return { result, chat: shell.requireChat(chatId), queue: queueStateOf(shell.runs.get(chatId)), id: reply?.result === "queued" ? reply.id : null };
  };
  const bodyOf = (text: string, options: ChatOptionsPatch, attachments: Attachment[], { pauseAfter = false, marks = {} }: SendOpts): SendBody => ({ text, options, attachments, pause_after: pauseAfter, ...marks });
  return {
    message,

    /** 終了した会話に追加の指示を送り、続きから再開する（作業中なら 409。message の when を省いた別名） */
    send: async (chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = [], opts: SendOpts = {}): Promise<Chat> => (await message(chatId, bodyOf(text, options, attachments, opts))).chat,

    /** 止めずに伝える（message の when: now の別名）。結果は told / held / queued（作業中の /clear）/ sent */
    tell: async (chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = [], opts: SendOpts = {}): Promise<TellResult["result"]> => (await message(chatId, { ...bodyOf(text, options, attachments, opts), when: "now" })).result,

    /** 次の指示を送る（message の when: later の別名）。queued: 列に入れたか、id: 列に入れたその指示の ID（すぐ送ったら null） */
    async queueMessage(chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = [], { hold = false, ...opts }: { hold?: boolean } & SendOpts = {}): Promise<{ queued: boolean; id: string | null }> {
      const sent = await message(chatId, { ...bodyOf(text, options, attachments, opts), when: "later", hold });
      return sent.result === "queued" ? { queued: true, id: sent.id } : { queued: false, id: null };
    },

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

    /** 指示の代わりに挟む行（会話の圧縮・コンテキストの消去）を足す（after: その指示のすぐあと。null ならいちばん下。すぐには行わない） */
    queueAction(chatId: number, action: QueueAction, after: string | null = null): void {
      shell.requireChat(chatId);
      shell.run(chatId, { type: "queue", commands: [{ op: "add_action", action, after }] });
    },

    /** 待ちの列から消す */
    removeQueued(chatId: number, id: string): void {
      if (!boxOf(chatId).later.some((m) => m.id === id)) throw missing();
      shell.run(chatId, { type: "queue", commands: [{ op: "remove", ids: [id] }] });
    },

    /** 待ちの指示を書き直す（attachments があれば添付も置き換える。文も添付もなくなるなら断る） */
    editQueued(chatId: number, id: string, text: string, attachments?: Attachment[]): void {
      if (!boxOf(chatId).later.some((m) => m.id === id)) throw missing();
      shell.run(chatId, { type: "queue", commands: [{ op: "edit", id, text, attachments }] });
    },

    /** 待ちの指示をすべて消す（消した数を返す） */
    clearQueued(chatId: number): number {
      const count = boxOf(chatId).later.length;
      shell.run(chatId, { type: "queue", commands: [{ op: "clear" }] });
      return count;
    },

    /** 待ちの指示をいくつかまとめて消す（消した数を返す） */
    removeQueuedMany(chatId: number, ids: string[]): number {
      const found = boxOf(chatId).later.filter((m) => ids.includes(m.id)).map((m) => m.id);
      if (found.length > 0) shell.run(chatId, { type: "queue", commands: [{ op: "remove", ids: found }] });
      return found.length;
    },

    /** 待ちの指示をいくつか、いちばん上か下・落とした位置へまとめて移す（扱った数を返す） */
    async moveQueuedMany(chatId: number, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }): Promise<number> {
      const count = boxOf(chatId).later.filter((m) => ids.includes(m.id)).length;
      await command(chatId, { op: "move", ids, to: typeof to === "object" ? { before: to.before, below_stop: to.belowStop } : to });
      return count;
    },

    /** 待ちの列を並べ替える */
    moveQueued: (chatId: number, id: string, index: number): Promise<void> => command(chatId, { op: "move", ids: [id], to: { index } }),

    /** 待ちの 1 件をすぐ送る（作業中なら止めずに伝え、伝えられなければ預かる。圧縮・消去の行ならすぐ行う） */
    async sendQueuedNow(chatId: number, id: string): Promise<void> {
      await shell.answer(chatId, shell.run(chatId, { type: "queue_send", mode: "now", id }));
    },

    /** 待ちの指示をすべて（ids を渡せばその指示だけ）1 つにまとめて、すぐ送る（列が空なら 409、選んだ指示が 1 つも列になければ 404） */
    async sendAllQueued(chatId: number, ids?: string[]): Promise<void> {
      await shell.answer(chatId, shell.run(chatId, { type: "queue_send", mode: "all", ...(ids ? { ids } : {}) }));
    },

    /** 選んだ待ちの指示を、送らずに 1 件にまとめる（まとめた 1 件は選んだうちのいちばん上の位置に残る。2 件以上選んでいなければ 400） */
    mergeQueued(chatId: number, ids: string[]): QueuedMessage {
      const first = boxOf(chatId).later.find((m) => ids.includes(m.id) && !queueActionOf(m));
      shell.run(chatId, { type: "queue", commands: [{ op: "merge", ids }] });
      return boxOf(chatId).later.find((m) => m.id === first!.id)!;
    },

    /** 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（止めている・印があっても最後まで送る。列が空なら 409） */
    async sendQueuedInOrder(chatId: number): Promise<void> {
      await shell.answer(chatId, shell.run(chatId, { type: "queue_send", mode: "in_order" }));
    },

    /** 印の位置をまとめて置き換える（ドラッグで動かした・× で外した） */
    setQueueStops: (chatId: number, stops: number[]): Promise<void> => command(chatId, { op: "set_stops", stops }),

    /** その指示のすぐあとに印を付ける・外す（id が null ならすべて外す） */
    setQueueStopAfter: (chatId: number, id: string | null, stop = true): Promise<void> => command(chatId, { op: "stop_after", id, stop }),

    /** 待ちの列を止めておくかを切り替える（列が空なら止めない。自動で送るに戻したら、Kickoff の門も外し、作業中でなければ先頭をすぐ送る）。止めておくかを返す */
    async setQueuePaused(chatId: number, paused: boolean): Promise<boolean> {
      const done = shell.run(chatId, { type: "queue", commands: [{ op: "set_paused", paused }] });
      const next = boxOf(chatId).paused;
      await shell.answer(chatId, done);
      return next;
    },

    /** 画面で書き直している送信待ちの指示を丸ごと置き換える（空なら外す。開いている間、画面は持ち時間 EDIT_HOLD_TTL_MS より短い間隔で知らせ直す） */
    setQueueEditing(chatId: number, ids: string[]) {
      shell.dispatch(chatId, { type: "editing", lane: "later", ids });
    },

    /** 画面で書き直している預かった指示を丸ごと置き換える（空なら外す。書き直している間は、送る順が来てもその指示から後ろを送らずに待つ） */
    setAfterCompactEditing(chatId: number, ids: string[]) {
      shell.dispatch(chatId, { type: "editing", lane: "now", ids });
    },

    /** 預かった指示を、送らずに外す（外した指示を返す。もう伝えたなら 404、いまの作業に足している途中なら 409） */
    removeAfterCompact(chatId: number, messageId: string): QueuedMessage {
      const run = shell.runs.get(chatId);
      const message = heldOf(run, messageId);
      if (telling(run)) throw new Conflict(TELLING);
      shell.run(chatId, { type: "queue", commands: [{ op: "remove", ids: [messageId] }] });
      return message;
    },

    /**
     * 預かった指示をその場で書き直す（送る順はそのまま）。書き直し中の印も外し、送る順が来ていれば送る。
     * もう伝えたなら 404、書き直し中の印がないままいまの作業に足している途中なら 409、圧縮後指示・文も添付もなくなるなら 400
     */
    updateAfterCompact(chatId: number, messageId: string, text: string, attachments: Attachment[]): QueuedMessage {
      const run = shell.runs.get(chatId);
      heldOf(run, messageId);
      const cmd: QueueCommand = { op: "edit", id: messageId, text, attachments };
      const next = applyQueueCommand(run.outbox, cmd, shell.outboxEnv());
      if (isQueueReject(next)) throw rejection(next.reject, next.message);
      if (telling(run, messageId)) throw new Conflict(TELLING);
      shell.run(chatId, { type: "queue", commands: [cmd] });
      return next.now.find((m) => m.id === messageId)!;
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

    /** コンテキストを消去する（セッションを外し、次の指示から新しい会話。記録は残し、区切り context_cleared を残す）。作業中・まだ会話がなければ 409 */
    clearContext(chatId: number): Chat {
      shell.requireChat(chatId);
      shell.requireIdle(chatId, "コンテキストの消去");
      shell.run(chatId, { type: "clear", pump: false });
      return shell.requireChat(chatId);
    },

    /** つながったら自動で再開するのをやめる（待っていなければ 409） */
    stopReconnect(chatId: number): void {
      shell.run(chatId, { type: "stop_reconnect" });
    },
  };
}
