// 1 つのチャットの出す箱（Outbox）の純粋な操作。コアの実行が持ち、変わるたびに丸ごと保存して画面に配る。型と純粋な関数のみ
import { moveToSlot, normalizeStops, remapStops, removeStopOnce, type QueueSlot } from "./queueStops";
import { isQueueAction, queueActionOf } from "./queueActions";
import type { MessageMarks } from "./chatEvent";
import type { Attachment, ChatOptionsPatch, QueueAction, QueuedMessage } from "./types";

/**
 * 出す箱。now = 預かり（いまのやり取りが終わったら送信待ちより先に送る。圧縮後指示・移動の続きも。画面の after_compact）、
 * later = 送信待ち（いまの作業が終わったら先頭から 1 件ずつ送る）。stops・paused は later の印:
 * 「ここまで送ったら止めます」の線の位置（0 = 1 件目の上、n = n 件目のあと。小さい順。同じ位置に何本でも）と、終わっても自動で送らずに止めておくか
 * （列が空になったら自動で送るに戻す）。どの操作も、変えないときは同じ箱を返す（呼ぶ側は箱が変わったときだけ保存して配る）
 */
export interface Outbox {
  now: QueuedMessage[];
  later: QueuedMessage[];
  stops: number[];
  paused: boolean;
}

/** 行を作るときの時刻と ID（外から渡す） */
export interface OutboxEnv {
  now: string;
  newId: () => string;
}

export const EMPTY_OUTBOX: Outbox = { now: [], later: [], stops: [], paused: false };

/**
 * 保存した箱を読み戻すときの形。止めておくか・線は保存したままだが、すべて送ったあとの線だけが残った空の送信待ちは、線も読み戻さない
 * （その線が待っていた作業は、アプリの終了で終わっている）
 */
export function restoreOutbox(saved: Outbox): Outbox {
  const { now, later } = saved;
  return { now, later, paused: later.length > 0 && saved.paused, stops: later.length > 0 ? normalizeStops(saved.stops, later.length) : [] };
}

/** 新しい指示の行 */
export function newMessage(env: OutboxEnv, text: string, options: ChatOptionsPatch, attachments: Attachment[], marks: MessageMarks = {}): QueuedMessage {
  return { id: env.newId(), text, options, attachments, created_at: env.now, ...marks };
}

/** 指示の代わりに挟む行（文・添付・選択は空） */
function actionItem(env: OutboxEnv, action: QueueAction): QueuedMessage {
  return { id: env.newId(), text: "", options: {}, attachments: [], created_at: env.now, [action]: true };
}

/**
 * 送信待ちを置き換える。線は前の指示が減った分だけ上に寄せる（並べ替えでは動かない）。
 * keepStops: 送って空になっても線を残す（最後の指示のあとの線は、次に来た指示の前で止める）。消して空になったら線も外し、自動で送るに戻す
 */
function setLater(box: Outbox, list: QueuedMessage[], { keepStops = false }: { keepStops?: boolean } = {}): Outbox {
  const stops = remapStops(box.later, list, box.stops);
  return { ...box, later: list, paused: list.length === 0 ? false : box.paused, stops: list.length === 0 && !keepStops ? [] : stops };
}

/** 指示を見た目の並びのすき間へ動かし、線もそれに合わせる（queueStops.ts の moveToSlot） */
function moveTo(box: Outbox, ids: string[], slot: QueueSlot): Outbox {
  const moved = moveToSlot(box.later, box.stops, ids, slot);
  return { ...box, later: moved.list, stops: moved.stops };
}

/** 1 件を見た目の並びのすき間へ入れる（いちばん下に足してから、そのすき間へ動かす） */
function insert(box: Outbox, message: QueuedMessage, slot: QueueSlot): Outbox {
  return moveTo({ ...box, later: [...box.later, message] }, [message.id], slot);
}

/** 送信待ちのいちばん下に足す */
export function addLater(box: Outbox, message: QueuedMessage): Outbox {
  return setLater(box, [...box.later, message]);
}

/** 線の位置をまとめて置き換える（ドラッグで動かした・× で外した。列の長さに収める） */
export function setStops(box: Outbox, stops: number[]): Outbox {
  return { ...box, stops: normalizeStops(stops, box.later.length) };
}

/** その指示のすぐあとに線を付ける・外す（id が null ならすべて外す。もう線があれば増やさない。id が列になければ null） */
export function setStopAfter(box: Outbox, id: string | null, stop: boolean): Outbox | null {
  if (id === null) return setStops(box, []);
  const index = box.later.findIndex((m) => m.id === id);
  if (index < 0) return null;
  if (!stop) return setStops(box, box.stops.filter((k) => k !== index + 1));
  return box.stops.includes(index + 1) ? box : setStops(box, [...box.stops, index + 1]);
}

/** 1 件目の上に線を足す（質問として送った作業が終わったら止める。もう線があれば足さない = 重ねると止まるのが 2 回になる） */
export function pauseAtHead(box: Outbox): Outbox {
  return box.stops[0] === 0 ? box : setStops(box, [...box.stops, 0]);
}

/** 止めておくかを切り替える（列が空なら止めない）。自動で送るに戻したら、先頭の上の線を 1 本越えて次の線まで送る */
export function setPaused(box: Outbox, paused: boolean): Outbox {
  const next = paused && box.later.length > 0;
  if (next === box.paused) return box;
  return { ...box, paused: next, stops: next ? box.stops : removeStopOnce(box.stops, 0) };
}

/** 取り出す（id を省くと先頭。止めておくかは見ない。線は前の指示が減った分だけ上に寄り、すべて送ったら列の上に残る）。なければ null */
export function takeLater(box: Outbox, id?: string): { box: Outbox; item: QueuedMessage } | null {
  const item = id ? box.later.find((m) => m.id === id) : box.later[0];
  if (!item) return null;
  return { box: setLater(box, box.later.filter((m) => m !== item), { keepStops: true }), item };
}

/**
 * 自動で送る次の指示を取り出す（作業が終わったとき）。止めておくとき・先頭の上に線があるとき・列が空なら item は null。
 * 列が空なら、すべて送ったあとの線も外す（その作業のあいだに次の指示は来なかったので、線の役目は済んだ）
 */
export function takeNext(box: Outbox): { box: Outbox; item: QueuedMessage | null } {
  if (box.later.length === 0) return { box: box.stops.length > 0 ? setStops(box, []) : box, item: null };
  if (box.paused || box.stops[0] === 0) return { box, item: null };
  return takeLater(box)!;
}

/**
 * 指示の代わりに挟む行（会話の圧縮・コンテキストの消去）を足す。after を渡すとその指示のすぐあと（すぐあとに線があれば線の上 = 止まる前に行う）、
 * null ならいちばん下。after が列になければ null
 */
export function addAction(box: Outbox, action: QueueAction, after: string | null, env: OutboxEnv): Outbox | null {
  const message = actionItem(env, action);
  if (after === null) return addLater(box, message);
  const index = box.later.findIndex((m) => m.id === after);
  return index < 0 ? null : insert(box, message, { at: index + 1, belowStop: false });
}

/**
 * いまのやり取りが終わったら、すぐ行う（作業中の「会話を圧縮」・作業中に押した行の「すぐ送る」）。その行をいちばん上（1 件目の上の線よりも上）に入れる。
 * 止めているときは、止めるのを 1 件目の上の線に置き換える（この行だけは行い、そのあとで止まる）。もう予約していれば足さない
 */
export function reserve(box: Outbox, action: QueueAction, env: OutboxEnv): Outbox {
  const head = box.later[0];
  const same = head !== undefined && queueActionOf(head) === action;
  if (same && !box.paused && box.stops[0] !== 0) return box;
  let next = box;
  // 1 件目の上にもう線があれば、その線で止まるので足さない
  if (box.paused) next = { ...box, paused: false, stops: box.stops[0] === 0 ? box.stops : normalizeStops([0, ...box.stops], box.later.length) };
  // いちばん上がもう同じ行なら、足さずにその行を線の上へ出す
  return same ? moveTo(next, [head.id], { at: 0, belowStop: false }) : insert(next, actionItem(env, action), { at: 0, belowStop: false });
}

/**
 * 並べ替える（index は移したあとの位置。範囲の外は端に寄せる。なければ null）。線は動かしていない指示の側に残し、動かした指示だけが線を越える。
 * 1 つ上・下へ移すとき、すぐ隣が線なら、並びは変えずに線だけを越える（見た目の 1 行ぶん動かす）
 */
export function moveOne(box: Outbox, id: string, index: number): Outbox | null {
  const from = box.later.findIndex((m) => m.id === id);
  if (from < 0) return null;
  const to = Math.max(0, Math.min(box.later.length - 1, index));
  if (to === from) return box;
  const crossed = to === from - 1 ? from : to === from + 1 ? from + 1 : -1;
  if (box.stops.includes(crossed)) return setStops(box, box.stops.map((k) => (k === crossed ? (to < from ? from + 1 : from) : k)));
  return moveTo(box, [id], to < from ? { at: to, belowStop: true } : { at: to + 1, belowStop: false });
}

/**
 * いくつかを、並びを保ったまままとめて移す（列にある指示が 1 つもなければ同じ箱）。to: いちばん上・いちばん下、または
 * { before: その指示の前（null・列にない指示ならいちばん下）, belowStop: その位置に線があれば線の下に入れるか（省けば下） }
 */
export function moveMany(box: Outbox, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }): Outbox {
  const list = box.later;
  if (!list.some((m) => ids.includes(m.id))) return box;
  const before = typeof to === "object" && to.before !== null ? list.findIndex((m) => m.id === to.before) : -1;
  const slot: QueueSlot = to === "top" ? { at: 0, belowStop: true } : to === "bottom" ? { at: list.length, belowStop: false } : { at: before < 0 ? list.length : before, belowStop: to.belowStop ?? true };
  return moveTo(box, ids, slot);
}

/**
 * 1 つにまとめる（文は空行でつなぎ、添付は合わせ、選択は最後のもの。圧縮・消去の行はまとめずに残す）。ids を渡すとその指示だけを列の順にまとめ、
 * まとめた 1 件は選んだうちの先頭の位置に置く。まとめるものがなければ null
 */
export function mergeLater(box: Outbox, ids?: string[]): { box: Outbox; merged: QueuedMessage } | null {
  const list = box.later;
  const picked = (ids ? list.filter((m) => ids.includes(m.id)) : list).filter((m) => !isQueueAction(m));
  if (picked.length === 0) return null;
  const merged: QueuedMessage = {
    ...picked[picked.length - 1],
    id: picked[0].id,
    text: picked.map((m) => m.text).filter(Boolean).join("\n\n"),
    attachments: picked.flatMap((m) => m.attachments),
    created_at: picked[0].created_at,
  };
  return { box: setLater(box, list.flatMap((m) => (m.id === merged.id ? [merged] : picked.includes(m) ? [] : [m]))), merged };
}

/** 行を消す（now・later のどちらにある ID でも。消したものがなければ同じ箱） */
export function removeRows(box: Outbox, ids: string[]): Outbox {
  const later = box.later.filter((m) => !ids.includes(m.id));
  const now = box.now.filter((m) => !ids.includes(m.id));
  const next = later.length === box.later.length ? box : setLater(box, later);
  return now.length === box.now.length ? next : { ...next, now };
}

/** 行の文と添付を書き換える（now・later のどちらでも。なければ同じ箱） */
export function editRow(box: Outbox, id: string, text: string, attachments: Attachment[]): Outbox {
  const edit = (m: QueuedMessage) => (m.id === id ? { ...m, text, attachments } : m);
  if (box.later.some((m) => m.id === id)) return setLater(box, box.later.map(edit));
  return box.now.some((m) => m.id === id) ? { ...box, now: box.now.map(edit) } : box;
}

/** 送信待ちをすべて消す（空なら同じ箱） */
export function clearLater(box: Outbox): Outbox {
  return box.later.length > 0 ? setLater(box, []) : box;
}

/** AI を切り替えたときに待っていた指示だけ、元の AI のモデルや権限の指定を外す（外すものがなければ同じ箱） */
export function resetOptions(box: Outbox, ids: readonly string[]): Outbox {
  const chosen = new Set(ids);
  if (!box.later.some((m) => chosen.has(m.id) && Object.keys(m.options ?? {}).length > 0)) return box;
  return { ...box, later: box.later.map((m) => (chosen.has(m.id) ? { ...m, options: {} } : m)) };
}

/**
 * AI が作業場所を移したあとの続きの指示を置く: 送信待ちの先頭に予約した圧縮・消去があればそのあと、なければ預かりの前（作業の終わりに 1 件目として送り、
 * 残りの預かりはその作業に伝える）。利用者が送信待ちを止めていれば、送らずに送信待ちの先頭に入れる（stopped）。
 * 片付けを先にしたとき（afterFinish）は、片付けが止めた送信待ちは止めたまま、続きだけを預かりの前に置く
 */
export function placeContinuation(box: Outbox, item: QueuedMessage, afterFinish: boolean): { box: Outbox; stopped: boolean } {
  let actions = 0;
  while (actions < box.later.length && isQueueAction(box.later[actions])) actions++;
  const stopped = !afterFinish && (box.paused || box.stops.some((p) => p <= actions));
  if (stopped) return { box: insert(box, item, { at: actions, belowStop: true }), stopped };
  if (!afterFinish && actions > 0) return { box: insert(box, item, { at: actions, belowStop: false }), stopped };
  return { box: { ...box, now: [item, ...box.now] }, stopped };
}
