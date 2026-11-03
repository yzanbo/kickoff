import { errorMessage } from "./errors.js";
import type { FollowupQueue } from "./followups.js";
import type { Attachment, QueuedMessage, Run, RunOptions } from "./types.js";

/**
 * Runner の、作業中のチャットに送った次の指示の待ちの列（followups.ts）を扱う窓口。列そのものの出し入れは FollowupQueue で、
 * ここは API から呼ぶ操作（並べ替え・書き直し・すぐ送る・止めておくなど）と、終わったら先頭を送る処理だけ。
 * 送る・伝える・作業中かは Runner のものを使う
 */
export abstract class RunnerQueue {
  protected abstract readonly followups: FollowupQueue;
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
  async queueMessage(runId: number, text: string, options: RunOptions = {}, attachments: Attachment[] = []): Promise<{ queued: boolean; id?: string }> {
    if (!this.hasRun(runId)) throw new Error("実行が見つかりません");
    if (!this.isBusy(runId)) {
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
  moveQueuedMany = (runId: number, ids: string[], to: "top" | "bottom" | { before: string | null }): number => this.followups.moveMany(runId, ids, to);

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

  /** 「ここまで自動で送る」の印を付けた待ちの指示（列の順。いくつでも） */
  queueStopAfter(runId: number): string[] {
    return this.followups.stopAfterOf(runId);
  }

  /** 「ここまで自動で送る」の印を付ける・外す（その指示を送ったら止めておく。id が null ならすべて外す。id が列になければ false） */
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

  /** 待ちの列の先頭を送る（送れなければ、理由をチャットに残す） */
  protected async sendNextQueued(runId: number) {
    // 止めておくチャットは、終わっても送らない（行の「すぐ送る」で 1 件ずつ送る）
    if (this.followups.isPaused(runId)) return;
    const next = this.followups.take(runId);
    if (!next) return;
    try {
      await this.send(runId, next.text, next.options, next.attachments);
    } catch (e) {
      this.reportError(runId, `待ちの指示を送れませんでした: ${errorMessage(e)}`);
    }
  }
}
