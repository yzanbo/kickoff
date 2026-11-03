import { randomUUID } from "node:crypto";
import type { Attachment, QueuedMessage, RunOptions } from "./types.js";

/**
 * 作業中のチャットに送った次の指示の待ちの列（チャットごと）。
 * いまの作業が終わったら、Runner が先頭から 1 件ずつ送る。保存はせず、アプリを終えると消える
 */
export class FollowupQueue {
  private readonly lists = new Map<number, QueuedMessage[]>();

  /** onChange: 列が変わったとき（画面に配る） */
  constructor(private readonly onChange: (runId: number, list: QueuedMessage[]) => void) {}

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

  /** 文を書き換える（なければ false） */
  edit(runId: number, id: string, text: string): boolean {
    const list = this.list(runId);
    if (!list.some((m) => m.id === id)) return false;
    this.set(runId, list.map((m) => (m.id === id ? { ...m, text } : m)));
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
    // silent: すぐ取り出すときは、まとめた 1 件を画面に知らせない（列に一瞬出さない）
    if (silent) this.lists.set(runId, next);
    else this.set(runId, next);
    return merged;
  }

  /** いくつかをまとめて消す（消した数を返す） */
  removeMany(runId: number, ids: string[]): number {
    const list = this.list(runId);
    const next = list.filter((m) => !ids.includes(m.id));
    if (next.length !== list.length) this.set(runId, next);
    return list.length - next.length;
  }

  /** いくつかを、並びを保ったまま列のいちばん上・いちばん下へまとめて移す（動いた数を返す） */
  moveMany(runId: number, ids: string[], to: "top" | "bottom"): number {
    const list = this.list(runId);
    const picked = list.filter((m) => ids.includes(m.id));
    if (picked.length === 0) return 0;
    const rest = list.filter((m) => !ids.includes(m.id));
    this.set(runId, to === "top" ? [...picked, ...rest] : [...rest, ...picked]);
    return picked.length;
  }

  /** 取り出す（id を省くと先頭） */
  take(runId: number, id?: string): QueuedMessage | undefined {
    const list = this.list(runId);
    const message = id ? list.find((m) => m.id === id) : list[0];
    if (message) this.set(runId, list.filter((m) => m !== message));
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
  }

  private set(runId: number, list: QueuedMessage[]) {
    if (list.length === 0) this.lists.delete(runId);
    else this.lists.set(runId, list);
    this.onChange(runId, list);
  }
}
