import { randomUUID } from "node:crypto";
import type { SavedQueue } from "./store/queues.js";
import type { Attachment, QueuedMessage, RunOptions } from "./types.js";

/** 送信待ちの保存先（Store の listQueues / saveQueue。省けば保存しない） */
export interface QueuePersistence {
  listQueues(): SavedQueue[];
  saveQueue(queue: SavedQueue): void;
}

/**
 * 作業中のチャットに送った次の指示の待ちの列（チャットごと）。
 * いまの作業が終わったら、Runner が先頭から 1 件ずつ送る（止めておくチャットでは送らず、行の「すぐ送る」で 1 件ずつ送る）。
 * 「ここまで自動で送る」の印を付けた指示を送ったら、そこで止めておく（途中まで自動で送る）。
 * 変わるたびに DB に丸ごと書き（persistence）、起動したら読み戻す。前回の作業はアプリの終了で中断しているので、
 * 読み戻した列は止めておく（勝手に送らない。見出しの「自動で送る」・行の「すぐ送る」で送る）
 */
export class FollowupQueue {
  private readonly lists = new Map<number, QueuedMessage[]>();
  /** 終わっても自動で送らずに止めておくチャット（列が空になったら、自動で送るに戻す） */
  private readonly paused = new Set<number>();
  /** 「ここまで自動で送る」の印を付けた指示（チャットごとに 1 つ。送ったら止めておく） */
  private readonly stopAfter = new Map<number, string>();

  /** onChange: 列・止めておくか・「ここまで」の印が変わったとき（画面に配る） */
  constructor(
    private readonly onChange: (runId: number, list: QueuedMessage[], paused: boolean, stopAfter: string | null) => void,
    private readonly persistence?: QueuePersistence,
  ) {
    for (const saved of persistence?.listQueues() ?? []) {
      this.lists.set(saved.runId, saved.messages);
      this.paused.add(saved.runId);
      if (saved.stopAfter && saved.messages.some((m) => m.id === saved.stopAfter)) this.stopAfter.set(saved.runId, saved.stopAfter);
      this.save(saved.runId);
    }
  }

  /** 「ここまで自動で送る」の印を付けた指示（なければ null） */
  stopAfterOf(runId: number): string | null {
    return this.stopAfter.get(runId) ?? null;
  }

  /** 「ここまで自動で送る」の印を付ける・外す（id が列になければ false） */
  setStopAfter(runId: number, id: string | null): boolean {
    if (id !== null && !this.has(runId, id)) return false;
    if (id === null) this.stopAfter.delete(runId);
    else this.stopAfter.set(runId, id);
    this.notify(runId);
    return true;
  }

  /** 終わっても自動で送らずに止めておくか */
  isPaused(runId: number): boolean {
    return this.paused.has(runId);
  }

  /** 止めておくかを切り替える（列が空なら止めない。変わらなければ知らせない） */
  setPaused(runId: number, paused: boolean): boolean {
    const next = paused && this.list(runId).length > 0;
    if (next === this.paused.has(runId)) return next;
    if (next) this.paused.add(runId);
    else this.paused.delete(runId);
    this.notify(runId);
    return next;
  }

  list(runId: number): QueuedMessage[] {
    return this.lists.get(runId) ?? [];
  }

  add(runId: number, text: string, options: RunOptions, attachments: Attachment[]): QueuedMessage {
    const message: QueuedMessage = { id: randomUUID(), text, options, attachments, created_at: new Date().toISOString() };
    this.set(runId, [...this.list(runId), message]);
    return message;
  }

  /** 消す（なければ false） */
  remove(runId: number, id: string): boolean {
    const list = this.list(runId);
    if (!list.some((m) => m.id === id)) return false;
    this.set(runId, list.filter((m) => m.id !== id));
    return true;
  }

  /** 文を書き換える（attachments があれば添付も置き換える。なければ false） */
  edit(runId: number, id: string, text: string, attachments?: Attachment[]): boolean {
    const list = this.list(runId);
    if (!list.some((m) => m.id === id)) return false;
    this.set(runId, list.map((m) => (m.id === id ? { ...m, text, ...(attachments ? { attachments } : {}) } : m)));
    return true;
  }

  /** 並べ替える（index は移したあとの位置。範囲の外は端に寄せる。なければ false） */
  move(runId: number, id: string, index: number): boolean {
    const list = [...this.list(runId)];
    const from = list.findIndex((m) => m.id === id);
    if (from < 0) return false;
    const [message] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, index)), 0, message);
    this.set(runId, list);
    return true;
  }

  /**
   * 1 つにまとめる（文は空行でつなぎ、添付は合わせ、選択は最後のもの。silent なら画面に知らせない）。
   * ids を渡すとその指示だけを列の順にまとめ、まとめた 1 件は選んだうちの先頭の位置に置く（ほかの指示はそのまま）。なければ何もしない
   */
  merge(runId: number, { silent = false, ids }: { silent?: boolean; ids?: string[] } = {}): QueuedMessage | undefined {
    const list = this.list(runId);
    const picked = ids ? list.filter((m) => ids.includes(m.id)) : list;
    if (picked.length === 0) return undefined;
    const merged: QueuedMessage = {
      ...picked[picked.length - 1],
      id: picked[0].id,
      text: picked.map((m) => m.text).filter(Boolean).join("\n\n"),
      attachments: picked.flatMap((m) => m.attachments),
      created_at: picked[0].created_at,
    };
    const next = list.flatMap((m) => (m.id === merged.id ? [merged] : picked.includes(m) ? [] : [m]));
    // 「ここまで」の印をまとめた指示に付けていたら、まとめた 1 件に移す
    if (picked.some((m) => m.id === this.stopAfter.get(runId))) this.stopAfter.set(runId, merged.id);
    // silent: すぐ取り出すときは、まとめた 1 件を画面に知らせない（列に一瞬出さない）
    if (silent) {
      this.lists.set(runId, next);
      this.save(runId);
    } else this.set(runId, next);
    return merged;
  }

  /** いくつかをまとめて消す（消した数を返す） */
  removeMany(runId: number, ids: string[]): number {
    const list = this.list(runId);
    const next = list.filter((m) => !ids.includes(m.id));
    if (next.length !== list.length) this.set(runId, next);
    return list.length - next.length;
  }

  /**
   * いくつかを、並びを保ったまままとめて移す（動いた数を返す）。
   * to: いちばん上・いちばん下、または { before: その指示の前（null・選んだものの中・列にない指示ならいちばん下） }（ドラッグで落とした位置）
   */
  moveMany(runId: number, ids: string[], to: "top" | "bottom" | { before: string | null }): number {
    const list = this.list(runId);
    const picked = list.filter((m) => ids.includes(m.id));
    if (picked.length === 0) return 0;
    const rest = list.filter((m) => !ids.includes(m.id));
    const at = to === "top" ? 0 : to === "bottom" ? rest.length : rest.findIndex((m) => m.id === to.before);
    const index = at < 0 ? rest.length : at;
    this.set(runId, [...rest.slice(0, index), ...picked, ...rest.slice(index)]);
    return picked.length;
  }

  /** 取り出す（id を省くと先頭）。「ここまで」の印を付けた指示なら、残りは止めておく */
  take(runId: number, id?: string): QueuedMessage | undefined {
    const list = this.list(runId);
    const message = id ? list.find((m) => m.id === id) : list[0];
    if (!message) return undefined;
    const rest = list.filter((m) => m !== message);
    if (this.stopAfter.get(runId) === message.id) {
      this.stopAfter.delete(runId);
      if (rest.length > 0) this.paused.add(runId);
    }
    this.set(runId, rest);
    return message;
  }

  has(runId: number, id: string): boolean {
    return this.list(runId).some((m) => m.id === id);
  }

  /** すべて消す（消した数を返す） */
  clear(runId: number): number {
    const count = this.list(runId).length;
    if (count > 0) this.set(runId, []);
    return count;
  }

  /** チャットを消したとき（知らせない） */
  forget(runId: number) {
    this.lists.delete(runId);
    this.paused.delete(runId);
    this.stopAfter.delete(runId);
    this.save(runId);
  }

  private set(runId: number, list: QueuedMessage[]) {
    if (list.length === 0) {
      this.lists.delete(runId);
      // 送り終えた・消した: 次にためるときは、自動で送るから始める
      this.paused.delete(runId);
    } else this.lists.set(runId, list);
    // 「ここまで」の印を付けた指示を消したら、印も外す
    const stop = this.stopAfter.get(runId);
    if (stop && !list.some((m) => m.id === stop)) this.stopAfter.delete(runId);
    this.notify(runId);
  }

  private notify(runId: number) {
    this.save(runId);
    this.onChange(runId, this.list(runId), this.paused.has(runId), this.stopAfterOf(runId));
  }

  /** いまの列を保存する（空なら消す） */
  private save(runId: number) {
    this.persistence?.saveQueue({ runId, messages: this.list(runId), paused: this.paused.has(runId), stopAfter: this.stopAfterOf(runId) });
  }
}
