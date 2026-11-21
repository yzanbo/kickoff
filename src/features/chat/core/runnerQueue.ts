import { Conflict, Invalid, NotFound, type AppError } from "@/foundation/core/errors";
import { outboxEnv, type ChatRuntime } from "./runtime";
import { queueStateOf } from "./live";
import type { ChatRuntimes } from "./runtimes";
import { applyQueueCommand, isQueueReject, type QueueCommand } from "@shared/chat/queueCommand";
import { queueActionOf } from "@shared/chat/queueActions";
import type { MessageMarks } from "@shared/chat/chatEvent";
import type { Attachment, QueueAction, QueuedMessage, Chat, ChatOptionsPatch } from "@shared/chat/types";
import type { TellResult } from "@shared/foundation/apiTypes";
import type { Effect, RunEvent } from "@/features/chat/core/run/machine/types";

/** 送る・伝えるときの指定。pauseAfter: 質問として送る（この指示の作業が終わったら、送信待ちを自動で送らずに一時停止する） */
export interface SendOpts {
  pauseAfter?: boolean;
  /** 発言の印（依頼文の頼み・子チャットから渡した依頼）。発言の記録・送信待ちの行・預かりに同じ形で残す */
  marks?: MessageMarks;
}

/** 出来事を回した答え（渡した出来事の命令と、それが始めた作業の準備。命令の実行が出した出来事のものは含まない） */
export interface Dispatched {
  effects: Effect[];
  started: Promise<void>[];
}

/** 列にない指示を指したとき（消した・送ったあと） */
const missing = () => new NotFound("待ちの指示が見つかりません");

/** 決まりが断った理由を、失敗の種類の例外にする */
const rejection = (status: 400 | 404 | 409, message: string): AppError => (status === 400 ? new Invalid(message) : status === 404 ? new NotFound(message) : new Conflict(message));

/**
 * Runner の、送信待ち（チャットごとの出す箱の later）と預かり（now）を扱う窓口。どの操作も出来事にして dispatch に渡すだけ
 * （決まりは run/machine の step。列の出し入れは @shared/chat/outbox・queueCommand の純粋な関数）。
 * できなければ失敗の種類の例外を投げる（列にない指示は 404・送るものがないなどの状態は 409・入力は 400。@/foundation/core/errors）
 */
export abstract class RunnerQueue {
  /** チャットごとの作業中の状態（出す箱・書き直している行） */
  protected abstract readonly runtimes: ChatRuntimes;
  /** 出来事を回す（決まりの step を通し、命令を実行する） */
  abstract dispatch(chatId: number, event: RunEvent): Dispatched;
  /** その「いま」を足した結果を待つ（足せた told・預かった held） */
  protected abstract waitTell(chatId: number, id: string): Promise<"told" | "held">;
  /** チャット（なければ 404） */
  protected abstract requireChat(chatId: number): Chat;

  private boxOf = (chatId: number) => this.runtimes.get(chatId).outbox;

  /** 出来事を回し、断られたら失敗の種類の例外を投げる */
  protected run(chatId: number, event: RunEvent): Dispatched {
    const done = this.dispatch(chatId, event);
    const rejected = done.effects.find((e) => e.do === "reject");
    if (rejected) throw rejection(rejected.status, rejected.message);
    return done;
  }

  /** 送るの答え（すぐ送ったなら、送る準備が済むまで待つ。いまの作業に足すところなら、足した結果を待つ） */
  protected async answer(chatId: number, done: Dispatched): Promise<TellResult["result"]> {
    const reply = done.effects.find((e) => e.do === "reply");
    await Promise.all(done.started);
    if (!reply || reply.result === "sent") return "sent";
    return reply.result === "pending" ? this.waitTell(chatId, reply.id!) : reply.result;
  }

  /**
   * 終了した会話に追加の指示を送り、続きから再開する（作業中なら 409。pauseAfter なら、この作業が終わったら送信待ちを一時停止する）。
   * チャット欄の /clear は送らずにコンテキストを消去する
   */
  async send(chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = [], { pauseAfter = false, marks = {} }: SendOpts = {}): Promise<Chat> {
    this.requireChat(chatId);
    await Promise.all(this.run(chatId, { type: "send", when: "idle", message: { text, options, attachments, marks }, pauseAfter }).started);
    return this.requireChat(chatId);
  }

  /**
   * 止めずに伝える: 作業中なら、いまのやり取りに発言を足す（メインエージェントが、いまの手順の切れ目で読む。裏のサブエージェント・コマンドは動き続ける）。
   * 預かる理由（親の会話を写している・圧縮の前後・入力が閉じた・書き直し中）があれば預かり、作業の終わりに送信待ちより先に送る。
   * 口がまだなら、できるまで待って足す（足せなければ預かる）。作業していなければすぐ送る。結果は told / held / queued（作業中の /clear）/ sent
   */
  async tell(chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = [], { pauseAfter = false, marks = {} }: SendOpts = {}): Promise<TellResult["result"]> {
    this.requireChat(chatId);
    return this.answer(chatId, this.run(chatId, { type: "send", when: "now", message: { text, options, attachments, marks }, pauseAfter }));
  }

  /**
   * 次の指示を送る。作業中なら待ちの列に入れ（終わったら順に送る）、作業中でなければすぐ送る（hold なら送らずに列の最後に足す）。
   * pauseAfter なら、列に入れたその指示のすぐあとに一時停止の印を付ける。queued: 列に入れたか、id: 列に入れたその指示の ID（すぐ送ったら null）
   */
  async queueMessage(
    chatId: number,
    text: string,
    options: ChatOptionsPatch = {},
    attachments: Attachment[] = [],
    { hold = false, pauseAfter = false, marks = {} }: { hold?: boolean } & SendOpts = {},
  ): Promise<{ queued: boolean; id: string | null }> {
    this.requireChat(chatId);
    const done = this.run(chatId, { type: "send", when: "later", message: { text, options, attachments, marks }, pauseAfter, hold });
    const reply = done.effects.find((e) => e.do === "reply");
    await Promise.all(done.started);
    return reply?.result === "queued" ? { queued: true, id: reply.id } : { queued: false, id: null };
  }

  /** 送信待ちの様子（チャットの詳細・SSE の chat_live・送信待ちを変える API の応答で同じ形） */
  queueState(chatId: number) {
    return queueStateOf(this.runtimes.get(chatId));
  }

  /** 列を変える（命令を当てられなければ失敗の種類の例外。並び・線が変わって次を送ったら、送る準備が済むまで待つ） */
  private command(chatId: number, command: QueueCommand): Promise<void> {
    return this.answer(chatId, this.run(chatId, { type: "queue", command })).then(() => {});
  }

  /** 指示の代わりに挟む行（会話の圧縮・コンテキストの消去）を足す（after: その指示のすぐあと。null ならいちばん下。すぐには行わない） */
  queueAction(chatId: number, action: QueueAction, after: string | null = null): void {
    this.requireChat(chatId);
    this.run(chatId, { type: "queue", command: { op: "add_action", action, after } });
  }

  /** 待ちの列から消す */
  removeQueued(chatId: number, id: string): void {
    if (!this.boxOf(chatId).later.some((m) => m.id === id)) throw missing();
    this.run(chatId, { type: "queue", command: { op: "remove", ids: [id] } });
  }

  /** 待ちの指示を書き直す（attachments があれば添付も置き換える。文も添付もなくなるなら断る） */
  editQueued(chatId: number, id: string, text: string, attachments?: Attachment[]): void {
    if (!this.boxOf(chatId).later.some((m) => m.id === id)) throw missing();
    this.run(chatId, { type: "queue", command: { op: "edit", id, text, attachments } });
  }

  /** 待ちの指示をすべて消す（消した数を返す） */
  clearQueued(chatId: number): number {
    const count = this.boxOf(chatId).later.length;
    this.run(chatId, { type: "queue", command: { op: "clear" } });
    return count;
  }

  /** 待ちの指示をいくつかまとめて消す（消した数を返す） */
  removeQueuedMany(chatId: number, ids: string[]): number {
    const found = this.boxOf(chatId).later.filter((m) => ids.includes(m.id)).map((m) => m.id);
    if (found.length > 0) this.run(chatId, { type: "queue", command: { op: "remove", ids: found } });
    return found.length;
  }

  /** 待ちの指示をいくつか、いちばん上か下・落とした位置へまとめて移す（扱った数を返す） */
  async moveQueuedMany(chatId: number, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }): Promise<number> {
    const count = this.boxOf(chatId).later.filter((m) => ids.includes(m.id)).length;
    await this.command(chatId, { op: "move", ids, to: typeof to === "object" ? { before: to.before, below_stop: to.belowStop } : to });
    return count;
  }

  /** 待ちの列を並べ替える */
  moveQueued(chatId: number, id: string, index: number): Promise<void> {
    return this.command(chatId, { op: "move", ids: [id], to: { index } });
  }

  /** 待ちの 1 件をすぐ送る（作業中なら止めずに伝え、伝えられなければ預かる。圧縮・消去の行ならすぐ行う） */
  async sendQueuedNow(chatId: number, id: string): Promise<void> {
    await this.answer(chatId, this.run(chatId, { type: "queue_send", mode: "now", id }));
  }

  /** 待ちの指示をすべて（ids を渡せばその指示だけ）1 つにまとめて、すぐ送る（列が空なら 409、選んだ指示が 1 つも列になければ 404） */
  async sendAllQueued(chatId: number, ids?: string[]): Promise<void> {
    await this.answer(chatId, this.run(chatId, { type: "queue_send", mode: "all", ...(ids ? { ids } : {}) }));
  }

  /** 選んだ待ちの指示を、送らずに 1 件にまとめる（まとめた 1 件は選んだうちのいちばん上の位置に残る。2 件以上選んでいなければ 400） */
  mergeQueued(chatId: number, ids: string[]): QueuedMessage {
    const first = this.boxOf(chatId).later.find((m) => ids.includes(m.id) && !queueActionOf(m));
    this.run(chatId, { type: "queue", command: { op: "merge", ids } });
    return this.boxOf(chatId).later.find((m) => m.id === first!.id)!;
  }

  /** 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（止めている・印があっても最後まで送る。列が空なら 409） */
  async sendQueuedInOrder(chatId: number): Promise<void> {
    await this.answer(chatId, this.run(chatId, { type: "queue_send", mode: "in_order" }));
  }

  /** 印の位置をまとめて置き換える（ドラッグで動かした・× で外した） */
  setQueueStops(chatId: number, stops: number[]): Promise<void> {
    return this.command(chatId, { op: "set_stops", stops });
  }

  /** その指示のすぐあとに印を付ける・外す（id が null ならすべて外す） */
  setQueueStopAfter(chatId: number, id: string | null, stop = true): Promise<void> {
    return this.command(chatId, { op: "stop_after", id, stop });
  }

  /** 待ちの列を止めておくかを切り替える（列が空なら止めない。自動で送るに戻したら、Kickoff の門も外し、作業中でなければ先頭をすぐ送る）。止めておくかを返す */
  async setQueuePaused(chatId: number, paused: boolean): Promise<boolean> {
    const done = this.run(chatId, { type: "queue", command: { op: "set_paused", paused } });
    const next = this.boxOf(chatId).paused;
    await this.answer(chatId, done);
    return next;
  }

  /** 画面で書き直している送信待ちの指示を丸ごと置き換える（空なら外す。開いている間、画面は持ち時間 EDIT_HOLD_TTL_MS より短い間隔で知らせ直す） */
  setQueueEditing(chatId: number, ids: string[]) {
    this.dispatch(chatId, { type: "editing", lane: "later", ids });
  }

  /** 画面で書き直している預かった指示を丸ごと置き換える（空なら外す。書き直している間は、送る順が来てもその指示から後ろを送らずに待つ） */
  setAfterCompactEditing(chatId: number, ids: string[]) {
    this.dispatch(chatId, { type: "editing", lane: "now", ids });
  }

  /** 預かりの行（なければ 404 = もう伝えた） */
  private heldOf(runtime: ChatRuntime, messageId: string): QueuedMessage {
    const message = runtime.outbox.now.find((m) => m.id === messageId);
    if (!message) throw new NotFound("その指示は、もう伝えたか見つかりません");
    return message;
  }

  /** いまの作業に足している途中か（editing を渡せば、その行を書き直していれば数えない。足している途中に預かりを変えると、別の指示を飛ばしうる） */
  private telling(runtime: ChatRuntime, editing?: string): boolean {
    const { phase, editing: edits } = runtime.run;
    return phase.kind === "turn" && phase.telling !== null && !(editing !== undefined && edits.now.includes(editing));
  }

  /** 預かった指示を、送らずに外す（外した指示を返す。もう伝えたなら 404、いまの作業に足している途中なら 409） */
  removeAfterCompact(chatId: number, messageId: string): QueuedMessage {
    const runtime = this.runtimes.get(chatId);
    const message = this.heldOf(runtime, messageId);
    if (this.telling(runtime)) throw new Conflict("圧縮のあとで順に伝えている途中です。少し待ってからやり直してください");
    this.run(chatId, { type: "queue", command: { op: "remove", ids: [messageId] } });
    return message;
  }

  /**
   * 預かった指示をその場で書き直す（送る順はそのまま）。書き直し中の印も外し、送る順が来ていれば送る。
   * もう伝えたなら 404、書き直し中の印がないままいまの作業に足している途中なら 409、圧縮後指示・文も添付もなくなるなら 400
   */
  updateAfterCompact(chatId: number, messageId: string, text: string, attachments: Attachment[]): QueuedMessage {
    const runtime = this.runtimes.get(chatId);
    this.heldOf(runtime, messageId);
    const command: QueueCommand = { op: "edit", id: messageId, text, attachments };
    const next = applyQueueCommand(runtime.outbox, command, outboxEnv());
    if (isQueueReject(next)) throw rejection(next.reject, next.message);
    if (this.telling(runtime, messageId)) throw new Conflict("圧縮のあとで順に伝えている途中です。少し待ってからやり直してください");
    this.run(chatId, { type: "queue", command });
    return next.now.find((m) => m.id === messageId)!;
  }
}
