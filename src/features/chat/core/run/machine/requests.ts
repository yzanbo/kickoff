// 利用者・API の出来事（送る・送信待ちの操作・すぐ送る・書き直し・圧縮・消去）の決まり（純粋。step.ts から呼ぶ）
import { addAction, addLater, mergeLater, newMessage, pauseAtHead, reserve, setStopAfter, setStops, takeLater } from "@shared/chat/outbox";
import { applyQueueCommand, isQueueReject, type QueueCommand } from "@shared/chat/queueCommand";
import { isClearCommand, queueActionOf } from "@shared/chat/queueActions";
import type { QueueAction, QueuedMessage } from "@shared/chat/types";
import { answerRestartQueue, deliverNow, NO_SESSION, pumpLater, resetHandoffQueue, startCompact, startItem } from "./outbox";
import { handoffAllows, holdOf, isBusy, isSwitching, queuePaused, waitingEdit } from "./state";
import type { ChatRunState, Effect, Env, Lane, RunEvent } from "./types";

/** 断る（step は状態を変えずに返す） */
function reject(s: ChatRunState, effects: Effect[], status: 400 | 404 | 409, message: string): ChatRunState {
  effects.push({ do: "reject", status, message });
  return s;
}

const MISSING = "待ちの指示が見つかりません";
const HANDOFF_PENDING = "AI の引き継ぎを確認するまで送信できません";

/** いまのやり取りが終わったら、すぐ行う（送信待ちのいちばん上に入れる。@shared/chat/outbox の reserve） */
const reserveAction = (s: ChatRunState, action: QueueAction, env: Env): ChatRunState => ({ ...s, outbox: reserve(s.outbox, action, env) });

/** 送る（when: idle = 作業中なら 409・now = 作業中なら止めずに伝える・later = 作業中なら送信待ちへ） */
export function sendOf(s: ChatRunState, e: Extract<RunEvent, { type: "send" }>, env: Env, effects: Effect[]): ChatRunState {
  const { text, options, attachments, marks } = e.message;
  const item = newMessage(env, text, options, attachments, marks);
  if (e.when === "now") return sendNow(s, item, env, effects, e.pauseAfter ?? false);
  if (e.when === "idle" || (!e.hold && !isBusy(s))) return sendIdle(s, item, env, effects, e.pauseAfter ?? false);
  // 送信待ちに入れる /clear は、文の指示ではなくコンテキスト消去の行にする（順が来たら消去する）
  if (isClearCommand(text, attachments)) {
    const outbox = addAction(s.outbox, "clear", null, env)!;
    effects.push({ do: "reply", result: "queued", id: outbox.later.at(-1)!.id });
    return { ...s, outbox };
  }
  let outbox = addLater(s.outbox, item);
  if (e.pauseAfter) outbox = setStopAfter(outbox, item.id, true)!;
  effects.push({ do: "reply", result: "queued", id: item.id });
  return { ...s, outbox };
}

/** 作業していないときに送る（作業中なら 409。チャット欄の /clear は送らずにコンテキストを消去し、送信待ちの次を送る） */
function sendIdle(s: ChatRunState, item: QueuedMessage, env: Env, effects: Effect[], pauseAfter: boolean): ChatRunState {
  if (isBusy(s)) return reject(s, effects, 409, "作業中のチャットは送信できません。終わってから（または中断してから）行ってください");
  if (!handoffAllows(env.handoff)) return reject(s, effects, 409, HANDOFF_PENDING);
  s = resetHandoffQueue(s, env);
  effects.push({ do: "reply", result: "sent", id: null });
  if (!isClearCommand(item.text, item.attachments)) return startItem(s, item, "user", effects, pauseAfter);
  s = clearIdle(s, env, effects);
  return pumpLater(s, { ...env, hasSession: false }, effects);
}

/**
 * 止めずに伝える: 作業していなければすぐ送る。作業中の /clear は終わったらすぐ消去する予約。ほかは預かりの後ろに足し、口が開いていれば
 * いまの作業に足す（足せなければ預かる）。預かる理由があるか口がまだなら預かったと答える（口ができたら足し、作業の終わりには送信待ちより先に送る）
 */
function sendNow(s: ChatRunState, item: QueuedMessage, env: Env, effects: Effect[], pauseAfter: boolean): ChatRunState {
  if (!isBusy(s)) return sendIdle(s, item, env, effects, pauseAfter);
  if (isSwitching(s.phase)) return reject(s, effects, 409, "AI の切り替え中は指示を送れません。切り替え後に送ってください");
  if (isClearCommand(item.text, item.attachments)) {
    effects.push({ do: "reply", result: "queued", id: null });
    return reserveAction(s, "clear", env);
  }
  // 口が開いていれば足した結果を待って答える。預かる理由があるか、口がまだ（送る準備の間・口ができる前）なら、出す箱の now に入れた時点で預かったと答える
  // （送った欄を待たせない。口ができたら足し、作業が終わったら新しい作業として送る）
  const open = s.phase.kind === "turn" && s.phase.tell === "open" && holdOf(s) === null;
  const outbox = pauseAfter ? pauseAtHead(s.outbox) : s.outbox;
  effects.push({ do: "reply", result: open ? "pending" : "held", id: item.id });
  return { ...s, outbox: { ...outbox, now: [...outbox.now, item] } };
}

/**
 * 列を変える。並び・線を変えて、作業が終わって先頭の上の線で待っていたのにその線がなくなったら次を送る。自動で送るに戻したら、起動したときの確かめにも
 * 答えたことにし、Kickoff の門も外して次を送る。預かりの行を書き直したら、書き直し中の印も外して送る順が来ていれば送る
 */
export function queueOf(s: ChatRunState, cmd: QueueCommand, env: Env, effects: Effect[]): ChatRunState {
  const before = s.outbox;
  if (cmd.op === "set_paused") {
    s = answerRestartQueue(s);
    const gate = s.gates.recovery;
    if (!cmd.paused && gate?.holds) s = { ...s, gates: { ...s.gates, recovery: { ...gate, holds: false } } };
  }
  const outbox = applyQueueCommand(s.outbox, cmd, env);
  if (isQueueReject(outbox)) return reject(s, effects, outbox.reject, outbox.message);
  s = { ...s, outbox };
  if (cmd.op === "move" || cmd.op === "set_stops" || cmd.op === "stop_after") {
    return before.stops[0] === 0 && outbox.stops[0] !== 0 && !queuePaused(s) && !isBusy(s) ? pumpLater(s, env, effects) : s;
  }
  if (cmd.op === "set_paused") return !outbox.paused && !isBusy(s) ? pumpLater(s, env, effects) : s;
  if (cmd.op === "edit" && before.now.some((m) => m.id === cmd.id)) return editingOf(s, "now", [], env, effects);
  return s;
}

/** 画面で書き直している行を丸ごと置き換える（空なら外す。その列にない行・圧縮後指示は数えない）。外れて送る順が来ていれば送る */
export function editingOf(s: ChatRunState, lane: Lane, ids: string[], env: Env, effects: Effect[]): ChatRunState {
  const editing = ids.filter((id) => s.outbox[lane].some((m) => m.id === id && !m.post_compact));
  const wasWaiting = waitingEdit(s);
  s = { ...s, editing: { ...s.editing, [lane]: editing } };
  effects.push({ do: "edit_timer", lane, on: editing.length > 0 });
  if (lane === "later") return wasWaiting && !isBusy(s) ? pumpLater(s, env, effects) : s;
  // 預かり: 作業していなければ 1 件目から新しい作業として送る（作業していないのに残っている圧縮後指示は、次に送る指示と一緒に伝えるので送らない）。
  // 作業中なら、いまの作業に足せるものを足す（step の終わりの pumpNow）
  const head = s.outbox.now[0];
  if (!head || isBusy(s) || head.post_compact || s.outbox.now.some((m) => editing.includes(m.id))) return s;
  return deliverNow(s, effects);
}

/** すぐ送る（1 件・まとめて・順に）。引き継ぎを確かめるまで・AI の交代の準備中は 409 */
export function queueSendOf(s: ChatRunState, e: Extract<RunEvent, { type: "queue_send" }>, env: Env, effects: Effect[]): ChatRunState {
  if (!handoffAllows(env.handoff) || isSwitching(s.phase)) return reject(s, effects, 409, HANDOFF_PENDING);
  if (e.mode === "in_order") {
    // 止めている・「ここまで」の印があっても最後まで送るよう、印を外して自動で送るに戻す
    if (s.outbox.later.length === 0) return reject(s, effects, 409, "送信待ちの指示がありません");
    return queueOf({ ...s, outbox: setStops(s.outbox, []) }, { op: "set_paused", paused: false }, env, effects);
  }
  s = resetHandoffQueue(s, env);
  if (e.mode === "now") return sendQueuedNow(s, e.id, env, effects);
  // すべて送るのは、起動したときの確かめにも答えたことにする（選んだものだけなら、残りはまだ決めていない）
  if (!e.ids) s = answerRestartQueue(s);
  const merged = mergeLater(s.outbox, e.ids);
  if (!merged) return e.ids ? reject(s, effects, 404, MISSING) : reject(s, effects, 409, "送信待ちの指示がありません");
  return sendQueuedNow({ ...s, outbox: merged.box }, merged.merged.id, env, effects);
}

/**
 * 待ちの 1 件をすぐ送る。作業中なら止めずに伝える（足せなければ預かる）。圧縮・消去の行ならすぐ行う（作業中なら、いまのやり取りが終わったらすぐ行うよう、
 * いちばん上へ。作業していなくて会話がなければ 409 で列に残す）。消去はその場で済むので、済んだら送信待ちの次を送る
 */
function sendQueuedNow(s: ChatRunState, id: string, env: Env, effects: Effect[]): ChatRunState {
  const found = s.outbox.later.find((m) => m.id === id);
  if (!found) return reject(s, effects, 404, MISSING);
  const action = queueActionOf(found);
  if (action && !handoffAllows(env.handoff, found)) return reject(s, effects, 409, "AI の引き継ぎが終わるまで、この操作はできません");
  if (action && !isBusy(s) && !env.hasSession) return reject(s, effects, 409, NO_SESSION[action]);
  s = { ...s, outbox: takeLater(s.outbox, id)!.box };
  if (action === "compact") return compactOf(s, env, effects);
  if (action === "clear") return isBusy(s) ? reserveAction(s, "clear", env) : pumpLater(clearIdle(s, env, effects), { ...env, hasSession: false }, effects);
  return sendNow(s, found, env, effects, false);
}

/**
 * 会話を圧縮する。作業中なら、圧縮前指示をいまの作業に足せれば足し（作業が最後まで終わったら圧縮する）、足せなければ予約にする。
 * 作業していなければ、圧縮前指示があれば先にその指示を送り、なければすぐ圧縮する（まだ会話がなければ 409）
 */
export function compactOf(s: ChatRunState, env: Env, effects: Effect[]): ChatRunState {
  if (env.handoff !== null) return reject(s, effects, 409, "AI の引き継ぎが終わるまで圧縮できません");
  const p = s.phase;
  if (p.kind === "turn" && p.tell === "open" && env.hasSession && env.preCompact && !env.preCompactSent && !p.compaction.afterTurn && holdOf(s) === null) {
    effects.push({ do: "tell_pre_compact", text: env.preCompact });
    return s;
  }
  if (isBusy(s)) return reserveAction(s, "compact", env);
  if (!env.hasSession) return reject(s, effects, 409, NO_SESSION.compact);
  return startCompact(s, env, null, effects);
}

/** 作業中に足した圧縮前指示の結果（足せたら圧縮が終わるまで「いま」を預かり、作業が最後まで終わったら手で頼んだ圧縮として圧縮する。足せなければ予約） */
export function preCompactToldOf(s: ChatRunState, ok: boolean, env: Env): ChatRunState {
  const p = s.phase;
  if (!ok || p.kind !== "turn") return reserveAction(s, "compact", env);
  return { ...s, phase: { ...p, compaction: { ...p.compaction, awaiting: true, afterTurn: true } } };
}

/** コンテキストを消去する（作業中なら、いまのやり取りが終わったらすぐ消去する予約。pump なら、消したあと送信待ちの次を送る） */
export function clearOf(s: ChatRunState, env: Env, effects: Effect[], pump: boolean): ChatRunState {
  if (isBusy(s)) return reserveAction(s, "clear", env);
  s = clearIdle(s, env, effects);
  return pump && !effects.some((e) => e.do === "reject") ? pumpLater(s, { ...env, hasSession: false }, effects) : s;
}

/** 作業していないときにコンテキストを消去する（引き継ぎが終わるまで・まだ会話がなければ 409） */
function clearIdle(s: ChatRunState, env: Env, effects: Effect[]): ChatRunState {
  if (env.handoff !== null) return reject(s, effects, 409, "AI の引き継ぎが終わるまでコンテキストを消去できません");
  if (!env.hasSession) return reject(s, effects, 409, NO_SESSION.clear);
  effects.push({ do: "clear_session" });
  return s;
}
