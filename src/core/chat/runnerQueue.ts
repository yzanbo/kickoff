import { errorMessage } from "@shared/errors";
import type { FollowupQueue } from "./queue.js";
import type { QueueEditHolds } from "@shared/chat/queueEditHolds";
import type { Attachment, QueuedMessage, Run, RunOptions } from "@shared/types";

/**
 * Runner の、作業中のチャットに送った次の指示の待ちの列（followups.ts）を扱う窓口。列そのものの出し入れは FollowupQueue で、
 * ここは API から呼ぶ操作（並べ替え・書き直し・すぐ送る・止めておくなど）と、終わったら先頭を送る処理だけ。
 * 送る・伝える・作業中かは Runner のものを使う
 */
export abstract class RunnerQueue {
  protected abstract readonly followups: FollowupQueue;
  /** 画面でいま書き直している送信待ちの指示（自動で送る次の指示なら、書き直しが終わるまで送らない。queueEditHolds.ts） */
  protected abstract readonly editHolds: QueueEditHolds;
  /** 次の指示を書き直していたので、送らずに書き直しが終わるのを待っているチャット */
  protected readonly waitingForEdit = new Set<number>();
  /** 待ちの列の様子（書き直しを待っているかも）が変わったので、画面に配り直す */
  protected abstract queueChanged(runId: number): void;
  abstract isBusy(runId: number): boolean;
  abstract send(runId: number, text: string, options?: RunOptions, attachments?: Attachment[]): Promise<Run>;
  abstract tell(runId: number, text: string, options?: RunOptions, attachments?: Attachment[], opts?: { front?: boolean }): Promise<"told" | "sent" | "queued">;
  /** チャットがあるか */
  protected abstract hasRun(runId: number): boolean;
  /** 送れなかった理由をチャットに残す */
  protected abstract reportError(runId: number, message: string): void;

  /** 作業中のチャットの次の指示の待ちの列 */
  queued(runId: number): QueuedMessage[] {
    return this.followups.list(runId);
  }

  /**
   * 次の指示を送る。作業中なら待ちの列に入れ（終わったら順に送る）、作業中でなければすぐ送る。
   * queued: 列に入れたか、id: 列に入れたその指示の ID
   */
  async queueMessage(
    runId: number,
    text: string,
    options: RunOptions = {},
    attachments: Attachment[] = [],
    { hold = false }: { hold?: boolean } = {},
  ): Promise<{ queued: boolean; id?: string }> {
    if (!this.hasRun(runId)) throw new Error("実行が見つかりません");
    // hold: 作業していなくても送らずに、待ちの列の最後に足す（止めている送信待ちがあるときの「ためておく」）
    if (!hold && !this.isBusy(runId)) {
      await this.send(runId, text, options, attachments);
      return { queued: false };
    }
    const { id } = this.followups.add(runId, text, options, attachments);
    return { queued: true, id };
  }

  /** 待ちの列から消す（なければ false） */
  removeQueued = (runId: number, id: string): boolean => this.followups.remove(runId, id);

  /** 待ちの指示を書き直す（attachments があれば添付も置き換える。文も添付もなくなるなら断る） */
  editQueued(runId: number, id: string, text: string, attachments?: Attachment[]): boolean {
    const message = this.followups.list(runId).find((m) => m.id === id);
    if (!message) return false;
    const nextAttachments = attachments ?? message.attachments;
    if (!text.trim() && nextAttachments.length === 0) throw new Error("メッセージか添付ファイルが必要です");
    return this.followups.edit(runId, id, text.trim(), nextAttachments);
  }

  /** 待ちの指示をすべて消す（消した数を返す） */
  clearQueued = (runId: number): number => this.followups.clear(runId);

  /** 待ちの指示をいくつかまとめて消す・いちばん上か下へまとめて移す（扱った数を返す） */
  removeQueuedMany = (runId: number, ids: string[]): number => this.followups.removeMany(runId, ids);
  moveQueuedMany = (runId: number, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }): number => this.followups.moveMany(runId, ids, to);

  /** 待ちの列を並べ替える（なければ false） */
  moveQueued(runId: number, id: string, index: number): boolean {
    return this.followups.move(runId, id, index);
  }

  /**
   * 待ちの 1 件をすぐ送る。作業中なら止めずに伝え、伝えられなければ列の先頭に戻す（なければ false）
   */
  async sendQueuedNow(runId: number, id: string): Promise<boolean> {
    const message = this.followups.take(runId, id);
    if (!message) return false;
    await this.tell(runId, message.text, message.options, message.attachments, { front: true });
    return true;
  }

  /**
   * 待ちの指示をすべて（ids を渡せばその指示だけ）1 つにまとめて、すぐ送る（作業中なら止めずに伝える）。送るものがなければ false
   */
  async sendAllQueued(runId: number, ids?: string[]): Promise<boolean> {
    // 1 つにまとめた指示を列から取り出して送る（列に「まとめた 1 件」を一瞬出さない）
    const merged = this.followups.merge(runId, { silent: true, ids });
    if (!merged) return false;
    return this.sendQueuedNow(runId, merged.id);
  }

  /**
   * 選んだ待ちの指示を、送らずに 1 件にまとめる（文は列の順に空行でつなぎ、添付も合わせる。まとめた 1 件は選んだうちのいちばん上の位置に残る）。
   * 2 件以上なければ undefined
   */
  mergeQueued(runId: number, ids: string[]): QueuedMessage | undefined {
    if (this.followups.list(runId).filter((m) => ids.includes(m.id)).length < 2) return undefined;
    return this.followups.merge(runId, { ids });
  }

  /**
   * 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（まとめない）。止めている・「ここまで」の印があっても最後まで送るよう、
   * 止めておくのをやめて印を外す。作業中でなければ先頭をすぐ送り、あとは終わるたびに次を送る（作業中なら、いまの作業が終わってから）。
   * 送るものがなければ false
   */
  async sendQueuedInOrder(runId: number): Promise<boolean> {
    if (this.followups.list(runId).length === 0) return false;
    this.followups.setStops(runId, []);
    await this.setQueuePaused(runId, false);
    return true;
  }

  /** 「ここまで送ったら止めます」の印の位置（0 = 1 件目の上、n = n 件目のあと） */
  queueStops(runId: number): number[] {
    return this.followups.stopsOf(runId);
  }

  /** 印の位置をまとめて置き換える（ドラッグで動かした・× で外した） */
  setQueueStops(runId: number, stops: number[]) {
    this.followups.setStops(runId, stops);
  }

  /** その指示のすぐあとに印を付ける・外す（id が null ならすべて外す。id が列になければ false） */
  setQueueStopAfter(runId: number, id: string | null, stop = true): boolean {
    return this.followups.setStopAfter(runId, id, stop);
  }

  /** 待ちの列を、いまの作業が終わっても自動で送らずに止めておくか */
  queuePaused(runId: number): boolean {
    return this.followups.isPaused(runId);
  }

  /**
   * 待ちの列を止めておくかを切り替える（列が空なら止めない）。自動で送るに戻したとき、作業中でなければ先頭をすぐ送る。
   * 止めておくかを返す
   */
  async setQueuePaused(runId: number, paused: boolean): Promise<boolean> {
    const next = this.followups.setPaused(runId, paused);
    if (!next && !this.isBusy(runId)) await this.sendNextQueued(runId);
    return next;
  }

  /**
   * 画面で書き直している送信待ちの指示を丸ごと置き換える（書き直す欄を開いている指示。空なら外す）。
   * 開いている間、画面は持ち時間（EDIT_HOLD_TTL_MS）より短い間隔で知らせ直す
   */
  setQueueEditing(runId: number, ids: string[]) {
    this.editHolds.set(runId, ids.filter((id) => this.followups.has(runId, id)));
  }

  /** 次の指示の書き直しが終わるのを待っているか（作業は終わり、送信の準備ができている。画面の案内に使う） */
  queueWaitingForEdit(runId: number): boolean {
    return this.waitingForEdit.has(runId);
  }

  /** 書き直しを待っているかを切り替える（変わったら画面に配る） */
  private setWaitingForEdit(runId: number, waiting: boolean) {
    if (waiting === this.waitingForEdit.has(runId)) return;
    if (waiting) this.waitingForEdit.add(runId);
    else this.waitingForEdit.delete(runId);
    this.queueChanged(runId);
  }

  /** 書き直している指示が変わった・外れた: 書き直しが終わるのを待っていたなら、いま送る（作業中なら、終わったときに送る） */
  protected editHoldsChanged(runId: number) {
    if (!this.waitingForEdit.has(runId) || this.isBusy(runId)) return;
    void this.sendNextQueued(runId);
  }

  /** 待ちの列の先頭を送る（送れなければ、理由をチャットに残す） */
  protected async sendNextQueued(runId: number) {
    // 作業中（送る準備の途中も）なら送らない（取り出すと送れずに消える。いまの作業が終わったときに、もう一度呼ばれる）
    if (this.isBusy(runId)) return;
    // 自動で送る次の指示を画面で書き直している間は送らず、書き直しが終わる（保存・やめる・欄を閉じる）のを待つ
    const head = this.followups.list(runId)[0];
    const holds = Boolean(head && !this.followups.isPaused(runId) && this.editHolds.isHeld(runId, head.id));
    this.setWaitingForEdit(runId, holds);
    if (holds) return;
    // 止めておくチャットは、終わっても送らない（行の「すぐ送る」で 1 件ずつ送る）。先頭の上に印があれば、ここで止めておく
    const next = this.followups.takeNext(runId);
    if (!next) return;
    try {
      await this.send(runId, next.text, next.options, next.attachments);
    } catch (e) {
      this.reportError(runId, `待ちの指示を送れませんでした: ${errorMessage(e)}`);
    }
  }
}
