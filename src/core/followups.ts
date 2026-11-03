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

  /** すべてを 1 つにまとめる（文は空行でつなぎ、添付は合わせ、選択は最後のもの。なければ何もしない） */
  merge(runId: number): QueuedMessage | undefined {
    const list = this.list(runId);
    if (list.length === 0) return undefined;
    const merged: QueuedMessage = {
      ...list[list.length - 1],
      id: list[0].id,
      text: list.map((m) => m.text).filter(Boolean).join("\n\n"),
      attachments: list.flatMap((m) => m.attachments),
      created_at: list[0].created_at,
    };
    this.set(runId, [merged]);
    return merged;
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
