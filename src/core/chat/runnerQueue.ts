import { errorMessage } from "@shared/errors";
import { Conflict, Invalid, NotFound } from "../http/errors.js";
import type { ChatRuntimes } from "./runtime.js";
import { queueActionOf } from "@shared/chat/queueActions";
import { QUEUE_ACTION_LABELS, type Attachment, type QueueAction, type QueuedMessage, type Chat, type ChatOptionsPatch, type QueueState, type TellResult } from "@shared/types";

/** 送る・伝えるときの指定。pauseAfter: 質問として送る（この指示の作業が終わったら、送信待ちを自動で送らずに一時停止する） */
export interface SendOpts {
  pauseAfter?: boolean;
}

/** まだ会話がないので行えないとき（作業していないときの「すぐ送る」） */
const NO_SESSION: Record<QueueAction, string> = {
  compact: "まだ会話がないので、圧縮できません",
  clear: "まだ会話がないので、消去するコンテキストがありません",
};

/** 列にない指示を指したとき（消した・送ったあと） */
const missing = () => new NotFound("待ちの指示が見つかりません");

/**
 * Runner の、作業中のチャットに送った次の指示の待ちの列（queue.ts の ChatQueue。チャットごとの ChatRuntime が持つ）を扱う窓口。
 * 列そのものの出し入れは ChatQueue で、ここは API から呼ぶ操作（並べ替え・書き直し・すぐ送る・止めておくなど）と、
 * 終わったら先頭を送る処理だけ。送る・伝える・作業中かは Runner のものを使う。
 * できなければ失敗の種類の例外を投げる（列にない指示は 404・送るものがないなどの状態は 409・入力は 400。http/errors.ts）
 */
export abstract class RunnerQueue {
  /** チャットごとの作業中の状態（送信待ちの列・書き直している指示・書き直しを待っているか） */
  protected abstract readonly runtimes: ChatRuntimes;
  abstract isBusy(chatId: number): boolean;
  abstract send(chatId: number, text: string, options?: ChatOptionsPatch, attachments?: Attachment[], opts?: SendOpts): Promise<Chat>;
  abstract tell(chatId: number, text: string, options?: ChatOptionsPatch, attachments?: Attachment[], opts?: SendOpts & { at?: number }): Promise<TellResult["result"]>;
  /** 会話を圧縮する（作業中なら、いまのやり取りが終わったらすぐ圧縮するよう、送信待ちのいちばん上に入れる） */
  abstract compact(chatId: number): Promise<Chat>;
  /** コンテキストを消去する（作業中なら 409・まだ会話がなければ 409） */
  abstract clearContext(chatId: number): Chat;
  /** チャット（なければ 404） */
  protected abstract requireChat(chatId: number): Chat;
  /** 送れなかった理由をチャットに残す */
  protected abstract reportError(chatId: number, message: string): void;

  /** チャットの送信待ちの列 */
  private queueOf(chatId: number) {
    return this.runtimes.get(chatId).queue;
  }

  /** 送信待ちの様子（チャットの詳細・SSE の chat_live・送信待ちを変える API の応答で同じ形） */
  queueState(chatId: number): QueueState {
    return this.runtimes.get(chatId).queueState();
  }

  /**
   * 次の指示を送る。作業中なら待ちの列に入れ（終わったら順に送る）、作業中でなければすぐ送る。
   * pauseAfter なら、列に入れたその指示のすぐあとに一時停止の印を付ける（すぐ送ったら、その作業が終わったら一時停止する）。
   * queued: 列に入れたか、id: 列に入れたその指示の ID（すぐ送ったら null）
   */
  async queueMessage(
    chatId: number,
    text: string,
    options: ChatOptionsPatch = {},
    attachments: Attachment[] = [],
    { hold = false, pauseAfter = false }: { hold?: boolean } & SendOpts = {},
  ): Promise<{ queued: boolean; id: string | null }> {
    this.requireChat(chatId);
    // hold: 作業していなくても送らずに、待ちの列の最後に足す（止めている送信待ちがあるときの「ためておく」）
    if (!hold && !this.isBusy(chatId)) {
      await this.send(chatId, text, options, attachments, { pauseAfter });
      return { queued: false, id: null };
    }
    const queue = this.queueOf(chatId);
    const { id } = queue.add(text, options, attachments);
    if (pauseAfter) queue.setStopAfter(id);
    return { queued: true, id };
  }

  /**
   * いま動いている作業が終わったら、送信待ちを自動で送らずに一時停止する（質問として送った指示が、いまの作業に入ったとき）。
   * 1 件目の上の印にする: 作業のあいだに来た指示の前で止まり、来なければ作業の終わりに外れる（ChatQueue.takeNext）
   */
  protected pauseAfterTurn(chatId: number) {
    this.queueOf(chatId).addStop(0);
  }

  /**
   * 指示の代わりに挟む行（会話の圧縮・コンテキストの消去）を送信待ちに足す（after: その指示のすぐあと。null ならいちばん下）。
   * 作業していなくても、すぐには行わない（列の順が来たら、ほかの指示と同じく自動で・行の「すぐ送る」で行う）
   */
  queueAction(chatId: number, action: QueueAction, after: string | null = null): void {
    this.requireChat(chatId);
    if (!this.queueOf(chatId).addAction(action, after ?? undefined)) throw missing();
  }

  /** 待ちの列から消す */
  removeQueued(chatId: number, id: string): void {
    if (!this.queueOf(chatId).remove(id)) throw missing();
  }

  /** 待ちの指示を書き直す（attachments があれば添付も置き換える。文も添付もなくなるなら断る） */
  editQueued(chatId: number, id: string, text: string, attachments?: Attachment[]): void {
    const queue = this.queueOf(chatId);
    const message = queue.list().find((m) => m.id === id);
    if (!message) throw missing();
    const action = queueActionOf(message);
    if (action) throw new Invalid(`「${QUEUE_ACTION_LABELS[action]}」の行は書き直せません`);
    const nextAttachments = attachments ?? message.attachments;
    if (!text.trim() && nextAttachments.length === 0) throw new Invalid("メッセージか添付ファイルが必要です");
    queue.edit(id, text.trim(), nextAttachments);
  }

  /** 待ちの指示をすべて消す（消した数を返す） */
  clearQueued(chatId: number): number {
    return this.queueOf(chatId).clear();
  }

  /** 待ちの指示をいくつかまとめて消す・いちばん上か下へまとめて移す（扱った数を返す） */
  removeQueuedMany(chatId: number, ids: string[]): number {
    return this.queueOf(chatId).removeMany(ids);
  }

  async moveQueuedMany(chatId: number, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }): Promise<number> {
    let moved = 0;
    await this.releasingStop(chatId, () => {
      moved = this.queueOf(chatId).moveMany(ids, to);
    });
    return moved;
  }

  /** 待ちの列を並べ替える */
  moveQueued(chatId: number, id: string, index: number): Promise<void> {
    return this.releasingStop(chatId, () => {
      if (!this.queueOf(chatId).move(id, index)) throw missing();
    });
  }

  /**
   * 待ちの 1 件をすぐ送る。作業中なら止めずに伝え、伝えられなければ列の先頭に戻す。
   * 圧縮・消去の行なら、すぐ行う（作業中なら、いまのやり取りが終わったらすぐ行うよう、いちばん上へ移す。まだ会話がなければ 409 で列に残す）。
   * 消去はその場で済むので、済んだら送信待ちの次を送る（止めているときは送らない。圧縮はその作業の終わりで送る）
   */
  async sendQueuedNow(chatId: number, id: string): Promise<void> {
    const queue = this.queueOf(chatId);
    const found = queue.list().find((m) => m.id === id);
    if (!found) throw missing();
    const action = queueActionOf(found);
    if (action && !this.isBusy(chatId) && !this.requireChat(chatId).session_id) throw new Conflict(NO_SESSION[action]);
    const message = queue.take(id)!;
    if (action === "compact") {
      await this.compact(chatId);
      return;
    }
    if (action === "clear") {
      if (this.isBusy(chatId)) {
        queue.reserve("clear");
        return;
      }
      this.clearContext(chatId);
      await this.sendNextQueued(chatId);
      return;
    }
    await this.tell(chatId, message.text, message.options, message.attachments, { at: 0 });
  }

  /**
   * 待ちの指示をすべて（ids を渡せばその指示だけ）1 つにまとめて、すぐ送る（作業中なら止めずに伝える）。
   * 列が空なら 409、選んだ指示が 1 つも列になければ 404
   */
  async sendAllQueued(chatId: number, ids?: string[]): Promise<void> {
    // 1 つにまとめた指示を列から取り出して送る（列に「まとめた 1 件」を一瞬出さない）
    const merged = this.queueOf(chatId).merge({ silent: true, ids });
    if (!merged) throw ids ? missing() : new Conflict("送信待ちの指示がありません");
    await this.sendQueuedNow(chatId, merged.id);
  }

  /**
   * 選んだ待ちの指示を、送らずに 1 件にまとめる（文は列の順に空行でつなぎ、添付も合わせる。まとめた 1 件は選んだうちのいちばん上の位置に残る）。
   * 列にあるものを 2 件以上選んでいなければ 400
   */
  mergeQueued(chatId: number, ids: string[]): QueuedMessage {
    const queue = this.queueOf(chatId);
    const merged = queue.list().filter((m) => ids.includes(m.id) && !queueActionOf(m)).length >= 2 ? queue.merge({ ids }) : undefined;
    if (!merged) throw new Invalid("まとめるには、送信待ちの指示を 2 件以上選んでください");
    return merged;
  }

  /**
   * 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（まとめない）。止めている・「ここまで」の印があっても最後まで送るよう、
   * 止めておくのをやめて印を外す。作業中でなければ先頭をすぐ送り、あとは終わるたびに次を送る（作業中なら、いまの作業が終わってから）。
   * 列が空なら 409
   */
  async sendQueuedInOrder(chatId: number): Promise<void> {
    const queue = this.queueOf(chatId);
    if (queue.list().length === 0) throw new Conflict("送信待ちの指示がありません");
    queue.setStops([]);
    await this.setQueuePaused(chatId, false);
  }

  /** 印の位置をまとめて置き換える（ドラッグで動かした・× で外した） */
  setQueueStops(chatId: number, stops: number[]): Promise<void> {
    return this.releasingStop(chatId, () => this.queueOf(chatId).setStops(stops));
  }

  /** その指示のすぐあとに印を付ける・外す（id が null ならすべて外す） */
  setQueueStopAfter(chatId: number, id: string | null, stop = true): Promise<void> {
    return this.releasingStop(chatId, () => {
      if (!this.queueOf(chatId).setStopAfter(id, stop)) throw missing();
    });
  }

  /**
   * 印・並びを変える。作業が終わって先頭の上の印で待っていたのに、その印がなくなった（消した・動かした・指示を線の上へ移した）なら、
   * そのまま次を送る（止めておくときは送らない）
   */
  private async releasingStop(chatId: number, change: () => void): Promise<void> {
    const queue = this.queueOf(chatId);
    const waiting = queue.stopsAtHead();
    change();
    if (waiting && !queue.stopsAtHead() && !queue.isPaused() && !this.isBusy(chatId)) await this.sendNextQueued(chatId);
  }

  /**
   * 待ちの列を止めておくかを切り替える（列が空なら止めない）。自動で送るに戻したとき、作業中でなければ先頭をすぐ送る。
   * 止めておくかを返す
   */
  async setQueuePaused(chatId: number, paused: boolean): Promise<boolean> {
    const next = this.queueOf(chatId).setPaused(paused);
    if (!next && !this.isBusy(chatId)) await this.sendNextQueued(chatId);
    return next;
  }

  /**
   * 画面で書き直している送信待ちの指示を丸ごと置き換える（書き直す欄を開いている指示。空なら外す）。
   * 開いている間、画面は持ち時間（EDIT_HOLD_TTL_MS）より短い間隔で知らせ直す
   */
  setQueueEditing(chatId: number, ids: string[]) {
    const { queue, edits } = this.runtimes.get(chatId);
    edits.set(ids.filter((id) => queue.has(id)));
  }

  /** 書き直している指示が変わった・外れた: 書き直しが終わるのを待っていたなら、いま送る（作業中なら、終わったときに送る） */
  protected editsChanged(chatId: number) {
    if (!this.runtimes.get(chatId).waitingEdit || this.isBusy(chatId)) return;
    void this.sendNextQueued(chatId);
  }

  /** 待ちの列の先頭を送る（送れなければ、理由をチャットに残す） */
  protected async sendNextQueued(chatId: number) {
    // 作業中（送る準備の途中も）なら送らない（取り出すと送れずに消える。いまの作業が終わったときに、もう一度呼ばれる）
    if (this.isBusy(chatId)) return;
    const runtime = this.runtimes.get(chatId);
    const { queue } = runtime;
    // 自動で送る次の指示を画面で書き直している間は送らず、書き直しが終わる（保存・やめる・欄を閉じる）のを待つ
    const head = queue.list()[0];
    const holds = Boolean(head && !queue.isPaused() && runtime.edits.has(head.id));
    runtime.update({ waitingEdit: holds });
    if (holds) return;
    // 止めておくチャットは、終わっても送らない（行の「すぐ送る」で 1 件ずつ送る）。先頭の上に印があれば、ここで止めておく
    const next = queue.takeNext();
    if (!next) return;
    if (next.compact) {
      // 圧縮の行: 会話を圧縮する（終わったら、その作業の終わりで次を送る）。始められなければ理由を残して次へ
      try {
        await this.compact(chatId);
      } catch (e) {
        this.reportError(chatId, `送信待ちの会話の圧縮を始められませんでした: ${errorMessage(e)}`);
        await this.sendNextQueued(chatId);
      }
      return;
    }
    if (next.clear) {
      // 消去の行: その場で済むので、すぐ次を送る（次の指示は新しい会話で始まる）。まだ会話がなければ消すものがないので、そのまま次へ
      if (this.requireChat(chatId).session_id) this.clearContext(chatId);
      await this.sendNextQueued(chatId);
      return;
    }
    try {
      await this.send(chatId, next.text, next.options, next.attachments);
    } catch (e) {
      this.reportError(chatId, `待ちの指示を送れませんでした: ${errorMessage(e)}`);
    }
  }
}
