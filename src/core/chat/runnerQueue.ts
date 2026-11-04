import { errorMessage } from "@shared/errors";
import type { ChatRuntimes } from "./runtime.js";
import type { Attachment, QueuedMessage, Chat, ChatOptionsPatch, QueueState } from "@shared/types";

/**
 * Runner の、作業中のチャットに送った次の指示の待ちの列（queue.ts の ChatQueue。チャットごとの ChatRuntime が持つ）を扱う窓口。
 * 列そのものの出し入れは ChatQueue で、ここは API から呼ぶ操作（並べ替え・書き直し・すぐ送る・止めておくなど）と、
 * 終わったら先頭を送る処理だけ。送る・伝える・作業中かは Runner のものを使う
 */
export abstract class RunnerQueue {
  /** チャットごとの作業中の状態（送信待ちの列・書き直している指示・書き直しを待っているか） */
  protected abstract readonly runtimes: ChatRuntimes;
  abstract isBusy(chatId: number): boolean;
  abstract send(chatId: number, text: string, options?: ChatOptionsPatch, attachments?: Attachment[]): Promise<Chat>;
  abstract tell(chatId: number, text: string, options?: ChatOptionsPatch, attachments?: Attachment[], opts?: { front?: boolean }): Promise<"told" | "sent" | "queued">;
  /** チャットがあるか */
  protected abstract hasChat(chatId: number): boolean;
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
   * queued: 列に入れたか、id: 列に入れたその指示の ID（すぐ送ったら null）
   */
  async queueMessage(
    chatId: number,
    text: string,
    options: ChatOptionsPatch = {},
    attachments: Attachment[] = [],
    { hold = false }: { hold?: boolean } = {},
  ): Promise<{ queued: boolean; id: string | null }> {
    if (!this.hasChat(chatId)) throw new Error("実行が見つかりません");
    // hold: 作業していなくても送らずに、待ちの列の最後に足す（止めている送信待ちがあるときの「ためておく」）
    if (!hold && !this.isBusy(chatId)) {
      await this.send(chatId, text, options, attachments);
      return { queued: false, id: null };
    }
    const { id } = this.queueOf(chatId).add(text, options, attachments);
    return { queued: true, id };
  }

  /** 待ちの列から消す（なければ false） */
  removeQueued(chatId: number, id: string): boolean {
    return this.queueOf(chatId).remove(id);
  }

  /** 待ちの指示を書き直す（attachments があれば添付も置き換える。文も添付もなくなるなら断る） */
  editQueued(chatId: number, id: string, text: string, attachments?: Attachment[]): boolean {
    const queue = this.queueOf(chatId);
    const message = queue.list().find((m) => m.id === id);
    if (!message) return false;
    const nextAttachments = attachments ?? message.attachments;
    if (!text.trim() && nextAttachments.length === 0) throw new Error("メッセージか添付ファイルが必要です");
    return queue.edit(id, text.trim(), nextAttachments);
  }

  /** 待ちの指示をすべて消す（消した数を返す） */
  clearQueued(chatId: number): number {
    return this.queueOf(chatId).clear();
  }

  /** 待ちの指示をいくつかまとめて消す・いちばん上か下へまとめて移す（扱った数を返す） */
  removeQueuedMany(chatId: number, ids: string[]): number {
    return this.queueOf(chatId).removeMany(ids);
  }

  moveQueuedMany(chatId: number, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }): number {
    return this.queueOf(chatId).moveMany(ids, to);
  }

  /** 待ちの列を並べ替える（なければ false） */
  moveQueued(chatId: number, id: string, index: number): boolean {
    return this.queueOf(chatId).move(id, index);
  }

  /**
   * 待ちの 1 件をすぐ送る。作業中なら止めずに伝え、伝えられなければ列の先頭に戻す（なければ false）
   */
  async sendQueuedNow(chatId: number, id: string): Promise<boolean> {
    const message = this.queueOf(chatId).take(id);
    if (!message) return false;
    await this.tell(chatId, message.text, message.options, message.attachments, { front: true });
    return true;
  }

  /**
   * 待ちの指示をすべて（ids を渡せばその指示だけ）1 つにまとめて、すぐ送る（作業中なら止めずに伝える）。送るものがなければ false
   */
  async sendAllQueued(chatId: number, ids?: string[]): Promise<boolean> {
    // 1 つにまとめた指示を列から取り出して送る（列に「まとめた 1 件」を一瞬出さない）
    const merged = this.queueOf(chatId).merge({ silent: true, ids });
    if (!merged) return false;
    return this.sendQueuedNow(chatId, merged.id);
  }

  /**
   * 選んだ待ちの指示を、送らずに 1 件にまとめる（文は列の順に空行でつなぎ、添付も合わせる。まとめた 1 件は選んだうちのいちばん上の位置に残る）。
   * 2 件以上なければ undefined
   */
  mergeQueued(chatId: number, ids: string[]): QueuedMessage | undefined {
    const queue = this.queueOf(chatId);
    if (queue.list().filter((m) => ids.includes(m.id)).length < 2) return undefined;
    return queue.merge({ ids });
  }

  /**
   * 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（まとめない）。止めている・「ここまで」の印があっても最後まで送るよう、
   * 止めておくのをやめて印を外す。作業中でなければ先頭をすぐ送り、あとは終わるたびに次を送る（作業中なら、いまの作業が終わってから）。
   * 送るものがなければ false
   */
  async sendQueuedInOrder(chatId: number): Promise<boolean> {
    const queue = this.queueOf(chatId);
    if (queue.list().length === 0) return false;
    queue.setStops([]);
    await this.setQueuePaused(chatId, false);
    return true;
  }

  /** 印の位置をまとめて置き換える（ドラッグで動かした・× で外した） */
  setQueueStops(chatId: number, stops: number[]) {
    this.queueOf(chatId).setStops(stops);
  }

  /** その指示のすぐあとに印を付ける・外す（id が null ならすべて外す。id が列になければ false） */
  setQueueStopAfter(chatId: number, id: string | null, stop = true): boolean {
    return this.queueOf(chatId).setStopAfter(id, stop);
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
    try {
      await this.send(chatId, next.text, next.options, next.attachments);
    } catch (e) {
      this.reportError(chatId, `待ちの指示を送れませんでした: ${errorMessage(e)}`);
    }
  }
}
