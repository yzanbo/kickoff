import { randomUUID } from "node:crypto";
import { moveToSlot, normalizeStops, remapStops, type QueueSlot } from "@shared/chat/queueStops";
import { isQueueAction, queueActionOf } from "@shared/chat/queueActions";
import type { SavedQueue } from "../db/queues.js";
import type { Attachment, QueueAction, QueuedMessage, ChatOptionsPatch, QueueState } from "@shared/types";

/** 送信待ちの保存先（Store の queues。省けば保存しない） */
export interface QueuePersistence {
  save(queue: SavedQueue): void;
}

/**
 * 1 つのチャットの、作業中に送った次の指示の待ちの列（送信待ち。ChatRuntime が持つ）。
 * いまの作業が終わったら、Runner が先頭から 1 件ずつ送る（止めておくなら送らず、行の「すぐ送る」で 1 件ずつ送る）。
 * 「ここまで送ったら止めます」の印（指示とは別に、列の中の位置で持つ。いくつでも・1 件目の上にも置ける）まで自動で送ったら、
 * そこで止めておく（途中まで自動で送る）。自動で送るに戻すと、その印を越えて次の印まで送る。
 * 変わるたびに DB に丸ごと書き（persistence）、起動したら読み戻す（restore）。前回の作業はアプリの終了で中断しているので、
 * 読み戻した列は止めておく（勝手に送らない。見出しの「自動で送る」・行の「すぐ送る」で送る）
 */
export class ChatQueue {
  private messages: QueuedMessage[] = [];
  /** 終わっても自動で送らずに止めておくか（列が空になったら、自動で送るに戻す） */
  private paused = false;
  /** 「ここまで送ったら止めます」の印の位置（0 = 1 件目の上、n = n 件目のあと。小さい順） */
  private stops: number[] = [];

  /** onChange: 列・止めておくか・「ここまで」の印が変わったとき（画面に配る） */
  constructor(
    private readonly chatId: number,
    private readonly onChange: () => void,
    private readonly persistence?: QueuePersistence,
  ) {}

  /**
   * 保存した列を読み戻す（起動したとき。知らせない）。指示があれば止めておく（止めたことも保存する）。
   * すべて送ったあとの印だけが残った空の列は、印も読み戻さない（その印が待っていた作業は、アプリの終了で終わっている）
   */
  restore(saved: SavedQueue) {
    this.messages = saved.messages;
    this.paused = saved.messages.length > 0;
    this.stops = saved.messages.length > 0 ? normalizeStops(saved.stops, saved.messages.length) : [];
    this.save();
  }

  /** 画面に配る形（書き直しを待っているかは ChatRuntime が足す） */
  snapshot(): Omit<QueueState, "waiting_edit"> {
    return { messages: this.messages, paused: this.paused, stops: this.stops };
  }

  list(): QueuedMessage[] {
    return this.messages;
  }

  /** 終わっても自動で送らずに止めておくか */
  isPaused(): boolean {
    return this.paused;
  }

  /** 「ここまで送ったら止めます」の印の位置（小さい順） */
  stopPositions(): number[] {
    return this.stops;
  }

  has(id: string): boolean {
    return this.messages.some((m) => m.id === id);
  }

  /** 印の位置をまとめて置き換える（ドラッグで動かした・× で外した。列の長さに収める） */
  setStops(stops: number[]) {
    this.stops = normalizeStops(stops, this.messages.length);
    this.notify();
  }

  /** 印を 1 つ足す（0 = 1 件目の上。いまの作業が終わったら止める = 質問として送る） */
  addStop(position: number) {
    this.setStops([...this.stops, position]);
  }

  /** その指示のすぐあとに印を付ける・外す（右クリックの「この指示のあとで止める」。id が null ならすべて外す。id が列になければ false） */
  setStopAfter(id: string | null, stop = true): boolean {
    if (id === null) {
      this.setStops([]);
      return true;
    }
    const index = this.messages.findIndex((m) => m.id === id);
    if (index < 0) return false;
    const current = this.stops.filter((k) => k !== index + 1);
    this.setStops(stop ? [...current, index + 1] : current);
    return true;
  }

  /**
   * 自動で送る次の指示を取り出す（作業が終わったとき）。止めておくとき・列が空なら undefined。
   * 先頭の上に印があれば（印のところまで送った）、送らずに止めておく（印は残し、自動で送るに戻したときに越える）。
   * 列が空なら、すべて送ったあとの印も外す（その作業のあいだに次の指示は来なかったので、印の役目は済んだ。
   * 残すと、あとで自分ですぐ送った作業の送信待ちの前で、思いがけず止まる）
   */
  takeNext(): QueuedMessage | undefined {
    if (this.messages.length === 0) {
      if (this.stops.length > 0) this.setStops([]);
      return undefined;
    }
    if (this.paused) return undefined;
    if (this.stops[0] === 0) {
      this.paused = true;
      this.notify();
      return undefined;
    }
    return this.take();
  }

  /** 止めておくかを切り替える（列が空なら止めない。変わらなければ知らせない） */
  setPaused(paused: boolean): boolean {
    const next = paused && this.messages.length > 0;
    if (next === this.paused) return next;
    this.paused = next;
    // 自動で送るに戻した: 先頭の上の印（そこで止まっていた）を越えて、次の印まで送る
    if (!next) this.stops = this.stops.filter((k) => k !== 0);
    this.notify();
    return next;
  }

  add(text: string, options: ChatOptionsPatch, attachments: Attachment[]): QueuedMessage {
    const message: QueuedMessage = { id: randomUUID(), text, options, attachments, created_at: new Date().toISOString() };
    this.set([...this.messages, message]);
    return message;
  }

  /**
   * 指示の代わりに挟む行（会話の圧縮・コンテキストの消去）を足す。after を渡すとその指示のすぐあと（すぐあとに一時停止の線があれば線の上 =
   * 止まる前に行う）、省けばいちばん下（指示を足したときと同じく、すべて送ったあとの線の下）。after が列になければ undefined
   */
  addAction(action: QueueAction, after?: string): QueuedMessage | undefined {
    const message = actionItem(action);
    if (after === undefined) {
      this.set([...this.messages, message]);
      return message;
    }
    const index = this.messages.findIndex((m) => m.id === after);
    if (index < 0) return undefined;
    this.insert(message, { at: index + 1, belowStop: false });
    return message;
  }

  /**
   * いまのやり取りが終わったら、すぐ行う（作業中の「会話を圧縮」・作業中に押した行の「すぐ送る」）。その行をいちばん上（1 件目の上の線よりも上）に入れる。
   * 止めているときは、止めるのを 1 件目の上の線に置き換える（この行だけは行い、そのあとで止まる）。もう予約していれば、その行を返す
   */
  reserve(action: QueueAction): QueuedMessage {
    const head = this.messages[0];
    const same = head !== undefined && queueActionOf(head) === action;
    if (same && !this.paused && this.stops[0] !== 0) return head;
    if (this.paused) {
      this.paused = false;
      this.stops = normalizeStops([0, ...this.stops], this.messages.length);
    }
    // いちばん上がもう同じ行なら、足さずにその行を線の上へ出す
    if (same) {
      this.moveTo([head.id], { at: 0, belowStop: false });
      return head;
    }
    const message = actionItem(action);
    this.insert(message, { at: 0, belowStop: false });
    return message;
  }

  /** 消す（なければ false） */
  remove(id: string): boolean {
    if (!this.has(id)) return false;
    this.set(this.messages.filter((m) => m.id !== id));
    return true;
  }

  /** 文を書き換える（attachments があれば添付も置き換える。なければ false） */
  edit(id: string, text: string, attachments?: Attachment[]): boolean {
    if (!this.has(id)) return false;
    this.set(this.messages.map((m) => (m.id === id ? { ...m, text, ...(attachments ? { attachments } : {}) } : m)));
    return true;
  }

  /**
   * 並べ替える（index は移したあとの位置。範囲の外は端に寄せる。なければ false）。
   * 印の線は動かしていない指示の側に残し、動かした指示だけが線を越える（いちばん上・下へ移しても、1 件目の上・いちばん下の線は端に残る）。
   * 1 つ上・下へ移すとき、すぐ隣が線なら、並びは変えずに線だけを越える（見た目の 1 行ぶん動かす）
   */
  move(id: string, index: number): boolean {
    const from = this.messages.findIndex((m) => m.id === id);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(this.messages.length - 1, index));
    if (to === from) return true;
    const crossed = to === from - 1 ? from : to === from + 1 ? from + 1 : -1;
    if (this.stops.includes(crossed)) {
      this.setStops(this.stops.map((k) => (k === crossed ? (to < from ? from + 1 : from) : k)));
      return true;
    }
    this.moveTo([id], to < from ? { at: to, belowStop: true } : { at: to + 1, belowStop: false });
    return true;
  }

  /**
   * 1 つにまとめる（文は空行でつなぎ、添付は合わせ、選択は最後のもの。silent なら画面に知らせない）。
   * ids を渡すとその指示だけを列の順にまとめ、まとめた 1 件は選んだうちの先頭の位置に置く（ほかの指示はそのまま）。なければ何もしない
   */
  merge({ silent = false, ids }: { silent?: boolean; ids?: string[] } = {}): QueuedMessage | undefined {
    const list = this.messages;
    // 圧縮・消去の行はまとめない（列に残す）
    const picked = (ids ? list.filter((m) => ids.includes(m.id)) : list).filter((m) => !isQueueAction(m));
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
      this.stops = remapStops(list, next, this.stops);
      this.messages = next;
      this.save();
    } else this.set(next);
    return merged;
  }

  /** いくつかをまとめて消す（消した数を返す） */
  removeMany(ids: string[]): number {
    const next = this.messages.filter((m) => !ids.includes(m.id));
    const removed = this.messages.length - next.length;
    if (removed > 0) this.set(next);
    return removed;
  }

  /**
   * いくつかを、並びを保ったまままとめて移す（動いた数を返す）。
   * to: いちばん上・いちばん下、または { before: その指示の前（null・列にない指示ならいちばん下）, belowStop: その位置に印の線があれば線の下に入れるか（省けば下） }
   * （ドラッグで落とした位置）。印の線は動かしていない指示の側に残し、動かした指示だけが線を越える（move と同じ）
   */
  moveMany(ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }): number {
    const list = this.messages;
    const count = list.filter((m) => ids.includes(m.id)).length;
    if (count === 0) return 0;
    const before = typeof to === "object" && to.before !== null ? list.findIndex((m) => m.id === to.before) : -1;
    const slot: QueueSlot =
      to === "top" ? { at: 0, belowStop: true } : to === "bottom" ? { at: list.length, belowStop: false } : { at: before < 0 ? list.length : before, belowStop: to.belowStop ?? true };
    this.moveTo(ids, slot);
    return count;
  }

  /** 取り出す（id を省くと先頭。止めておくかは見ない。印は前の指示が減った分だけ上に寄り、すべて送ったら列の上に残る） */
  take(id?: string): QueuedMessage | undefined {
    const message = id ? this.messages.find((m) => m.id === id) : this.messages[0];
    if (!message) return undefined;
    this.set(
      this.messages.filter((m) => m !== message),
      { keepStops: true },
    );
    return message;
  }

  /** すべて消す（消した数を返す） */
  clear(): number {
    const count = this.messages.length;
    if (count > 0) this.set([]);
    return count;
  }

  /** 1 件を見た目の並びのすき間へ入れる（いちばん下に足してから、そのすき間へ動かす） */
  private insert(message: QueuedMessage, slot: QueueSlot) {
    this.messages = [...this.messages, message];
    this.moveTo([message.id], slot);
  }

  /** 指示を見た目の並びのすき間へ動かし、印の線もそれに合わせる（queueStops.ts の moveToSlot） */
  private moveTo(ids: string[], slot: QueueSlot) {
    const moved = moveToSlot(this.messages, this.stops, ids, slot);
    this.messages = moved.list;
    this.stops = moved.stops;
    this.notify();
  }

  /**
   * 列を置き換える。印は前の指示が減った分だけ上に寄せる（並べ替えでは動かない）。
   * keepStops: 送って空になっても印を残す（最後の指示のあとの印は、次に来た指示の前で止める）。消して空になったら印も外す
   */
  private set(list: QueuedMessage[], { keepStops = false }: { keepStops?: boolean } = {}) {
    const stops = remapStops(this.messages, list, this.stops);
    this.messages = list;
    // 送り終えた・消した: 次にためるときは、自動で送るから始める
    if (list.length === 0) this.paused = false;
    this.stops = list.length === 0 && !keepStops ? [] : stops;
    this.notify();
  }

  private notify() {
    this.save();
    this.onChange();
  }

  /** いまの列を保存する（指示も印もなければ消す） */
  private save() {
    this.persistence?.save({ chatId: this.chatId, messages: this.messages, paused: this.paused, stops: this.stops });
  }
}

/** 指示の代わりに挟む行（文・添付・選択は空） */
function actionItem(action: QueueAction): QueuedMessage {
  return { id: randomUUID(), text: "", options: {}, attachments: [], created_at: new Date().toISOString(), [action]: true };
}
