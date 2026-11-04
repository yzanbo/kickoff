import { randomUUID } from "node:crypto";
import { moveToSlot, normalizeStops, remapStops, type QueueSlot } from "@shared/chat/queueStops";
import type { SavedQueue } from "../db/queues.js";
import type { Attachment, QueuedMessage, RunOptions } from "@shared/types";

/** 送信待ちの保存先（Store の listQueues / saveQueue。省けば保存しない） */
export interface QueuePersistence {
  listQueues(): SavedQueue[];
  saveQueue(queue: SavedQueue): void;
}

/**
 * 作業中のチャットに送った次の指示の待ちの列（チャットごと）。
 * いまの作業が終わったら、Runner が先頭から 1 件ずつ送る（止めておくチャットでは送らず、行の「すぐ送る」で 1 件ずつ送る）。
 * 「ここまで送ったら止めます」の印（指示とは別に、列の中の位置で持つ。いくつでも・1 件目の上にも置ける）まで自動で送ったら、
 * そこで止めておく（途中まで自動で送る）。自動で送るに戻すと、その印を越えて次の印まで送る。
 * 変わるたびに DB に丸ごと書き（persistence）、起動したら読み戻す。前回の作業はアプリの終了で中断しているので、
 * 読み戻した列は止めておく（勝手に送らない。見出しの「自動で送る」・行の「すぐ送る」で送る）
 */
export class FollowupQueue {
  private readonly lists = new Map<number, QueuedMessage[]>();
  /** 終わっても自動で送らずに止めておくチャット（列が空になったら、自動で送るに戻す） */
  private readonly paused = new Set<number>();
  /** 「ここまで送ったら止めます」の印の位置（チャットごと。0 = 1 件目の上、n = n 件目のあと。小さい順） */
  private readonly stops = new Map<number, number[]>();

  /** onChange: 列・止めておくか・「ここまで」の印が変わったとき（画面に配る） */
  constructor(
    private readonly onChange: (runId: number, list: QueuedMessage[], paused: boolean, stops: number[]) => void,
    private readonly persistence?: QueuePersistence,
  ) {
    for (const saved of persistence?.listQueues() ?? []) {
      // すべて送ったあとの印だけが残った空の列は、印だけを読み戻す（止めておく指示がないので、止めておくにはしない）
      if (saved.messages.length > 0) {
        this.lists.set(saved.runId, saved.messages);
        this.paused.add(saved.runId);
      }
      if (saved.stops.length > 0) this.stops.set(saved.runId, normalizeStops(saved.stops, saved.messages.length));
      this.save(saved.runId);
    }
  }

  /** 「ここまで送ったら止めます」の印の位置（小さい順） */
  stopsOf(runId: number): number[] {
    return this.stops.get(runId) ?? [];
  }

  /** 印の位置をまとめて置き換える（ドラッグで動かした・× で外した。列の長さに収める） */
  setStops(runId: number, stops: number[]) {
    this.putStops(runId, normalizeStops(stops, this.list(runId).length));
    this.notify(runId);
  }

  /** その指示のすぐあとに印を付ける・外す（右クリックの「この指示のあとで止める」。id が null ならすべて外す。id が列になければ false） */
  setStopAfter(runId: number, id: string | null, stop = true): boolean {
    if (id === null) {
      this.setStops(runId, []);
      return true;
    }
    const index = this.list(runId).findIndex((m) => m.id === id);
    if (index < 0) return false;
    const current = this.stopsOf(runId).filter((k) => k !== index + 1);
    this.setStops(runId, stop ? [...current, index + 1] : current);
    return true;
  }

  /**
   * 自動で送る次の指示を取り出す。止めておくチャット・列が空なら undefined。
   * 先頭の上に印があれば（印のところまで送った）、送らずに止めておく（印は残し、自動で送るに戻したときに越える）
   */
  takeNext(runId: number): QueuedMessage | undefined {
    if (this.paused.has(runId) || this.list(runId).length === 0) return undefined;
    if (this.stopsOf(runId)[0] === 0) {
      this.paused.add(runId);
      this.notify(runId);
      return undefined;
    }
    return this.take(runId);
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
    else {
      this.paused.delete(runId);
      // 自動で送るに戻した: 先頭の上の印（そこで止まっていた）を越えて、次の印まで送る
      this.putStops(runId, this.stopsOf(runId).filter((k) => k !== 0));
    }
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

  /**
   * 並べ替える（index は移したあとの位置。範囲の外は端に寄せる。なければ false）。
   * 印の線は動かしていない指示の側に残し、動かした指示だけが線を越える（いちばん上・下へ移しても、1 件目の上・いちばん下の線は端に残る）。
   * 1 つ上・下へ移すとき、すぐ隣が線なら、並びは変えずに線だけを越える（見た目の 1 行ぶん動かす）
   */
  move(runId: number, id: string, index: number): boolean {
    const list = this.list(runId);
    const from = list.findIndex((m) => m.id === id);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(list.length - 1, index));
    if (to === from) return true;
    const stops = this.stopsOf(runId);
    const crossed = to === from - 1 ? from : to === from + 1 ? from + 1 : -1;
    if (stops.includes(crossed)) {
      this.setStops(runId, stops.map((k) => (k === crossed ? (to < from ? from + 1 : from) : k)));
      return true;
    }
    this.moveTo(runId, [id], to < from ? { at: to, belowStop: true } : { at: to + 1, belowStop: false });
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
    if (silent) {
      this.putStops(runId, remapStops(list, next, this.stopsOf(runId)));
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
   * to: いちばん上・いちばん下、または { before: その指示の前（null・列にない指示ならいちばん下）, belowStop: その位置に印の線があれば線の下に入れるか（省けば下） }
   * （ドラッグで落とした位置）。印の線は動かしていない指示の側に残し、動かした指示だけが線を越える（move と同じ）
   */
  moveMany(runId: number, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }): number {
    const list = this.list(runId);
    const count = list.filter((m) => ids.includes(m.id)).length;
    if (count === 0) return 0;
    const before = typeof to === "object" && to.before !== null ? list.findIndex((m) => m.id === to.before) : -1;
    const slot: QueueSlot =
      to === "top" ? { at: 0, belowStop: true } : to === "bottom" ? { at: list.length, belowStop: false } : { at: before < 0 ? list.length : before, belowStop: to.belowStop ?? true };
    this.moveTo(runId, ids, slot);
    return count;
  }

  /** 指示を見た目の並びのすき間へ動かし、印の線もそれに合わせる（queueStops.ts の moveToSlot） */
  private moveTo(runId: number, ids: string[], slot: QueueSlot) {
    const moved = moveToSlot(this.list(runId), this.stopsOf(runId), ids, slot);
    this.lists.set(runId, moved.list);
    this.putStops(runId, moved.stops);
    this.notify(runId);
  }

  /** 取り出す（id を省くと先頭。止めておくかは見ない。印は前の指示が減った分だけ上に寄り、すべて送ったら列の上に残る） */
  take(runId: number, id?: string): QueuedMessage | undefined {
    const list = this.list(runId);
    const message = id ? list.find((m) => m.id === id) : list[0];
    if (!message) return undefined;
    this.set(runId, list.filter((m) => m !== message), { keepStops: true });
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
    this.stops.delete(runId);
    this.save(runId);
  }

  /**
   * 列を置き換える。印は前の指示が減った分だけ上に寄せる（並べ替えでは動かない）。
   * keepStops: 送って空になっても印を残す（最後の指示のあとの印は、次に来た指示の前で止める）。消して空になったら印も外す
   */
  private set(runId: number, list: QueuedMessage[], { keepStops = false }: { keepStops?: boolean } = {}) {
    const stops = remapStops(this.list(runId), list, this.stopsOf(runId));
    if (list.length === 0) {
      this.lists.delete(runId);
      // 送り終えた・消した: 次にためるときは、自動で送るから始める
      this.paused.delete(runId);
    } else this.lists.set(runId, list);
    this.putStops(runId, list.length === 0 && !keepStops ? [] : stops);
    this.notify(runId);
  }

  private putStops(runId: number, stops: number[]) {
    if (stops.length > 0) this.stops.set(runId, stops);
    else this.stops.delete(runId);
  }

  private notify(runId: number) {
    this.save(runId);
    this.onChange(runId, this.list(runId), this.paused.has(runId), this.stopsOf(runId));
  }

  /** いまの列を保存する（空なら消す） */
  private save(runId: number) {
    this.persistence?.saveQueue({ runId, messages: this.list(runId), paused: this.paused.has(runId), stops: this.stopsOf(runId) });
  }
}
