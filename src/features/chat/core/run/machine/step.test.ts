// 実行の状態機械（step）の表: 出来事を並べて渡し、状態と命令の列を比べる（偽のプロバイダーも待ちも要らない。API を通した流れは網 scenarios.runner.test.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { EMPTY_OUTBOX, newMessage } from "@shared/chat/outbox";
import { step } from "./step";
import { initialRunState, noCompaction } from "./state";
import type { ChatRunState, Effect, Env, RunEvent, TurnPhase } from "./types";

const env: Env = { now: "2026-11-22T00:00:00.000Z", newId: () => "id", shuttingDown: false, hasSession: true, hasTurnEndTasks: false, handoff: null, handoffQueued: [], preCompact: null, preCompactSent: false, autoResumeOnReconnect: true, chatFailed: false };
let seq = 0;
/** 出来事を順に渡す（ID は 1 から振る）。最後の状態と、すべての命令 */
function run(s: ChatRunState, events: RunEvent[], e: Partial<Env> = {}): { s: ChatRunState; effects: Effect[] } {
  seq = 0;
  const effects: Effect[] = [];
  for (const event of events) {
    const done = step(s, event, { ...env, newId: () => `n${++seq}`, ...e });
    s = done.state;
    effects.push(...done.effects);
  }
  return { s, effects };
}
const msg = (text: string) => ({ text, options: {}, attachments: [], marks: {} });
const now = (text: string): RunEvent => ({ type: "send", when: "now", message: msg(text) });
const later = (text: string): RunEvent => ({ type: "send", when: "later", message: msg(text) });
const row = (text: string, extra: object = {}) => ({ ...newMessage(env, text, {}, []), id: text, ...extra });
const turn = (patch: Partial<TurnPhase> = {}): ChatRunState => ({ ...initialRunState(), phase: { kind: "turn", id: "t", turn: "message", tell: "open", compaction: noCompaction(), stopRequested: false, telling: null, compactBy: null, ...patch } });
const texts = (s: ChatRunState, lane: "now" | "later") => s.outbox[lane].map((m) => m.text);
const kinds = (effects: Effect[]) => effects.map((e) => (e.do === "reply" ? `reply:${e.result}` : e.do === "start_turn" ? `start:${e.turn}:${e.item?.text ?? e.text ?? ""}:${e.from}` : e.do === "tell" ? `tell:${e.item.text}` : e.do));
const ended: RunEvent = { type: "turn_ended", outcome: { status: "completed", network: false } };

test("送る（作業していない）: 送る準備に入って作業を動かす命令を出す。作業中・引き継ぎを確かめるまでは断り（状態は変えない）、/clear は送らずに消去して送信待ちの次を送る", () => {
  const sent = run(initialRunState(), [{ type: "send", when: "idle", message: msg("1"), pauseAfter: true }]);
  assert.deepEqual(kinds(sent.effects), ["reply:sent", "start:message:1:user"]);
  assert.deepEqual(sent.s.phase, { kind: "preparing", why: "send", stopRequested: false });
  assert.equal((sent.effects[1] as Extract<Effect, { do: "start_turn" }>).pauseAfter, true);
  assert.deepEqual(run(sent.s, [{ type: "send", when: "idle", message: msg("2") }]).effects, [{ do: "reject", status: 409, message: "作業中のチャットは送信できません。終わってから（または中断してから）行ってください" }]);
  assert.deepEqual(kinds(run(initialRunState(), [{ type: "send", when: "idle", message: msg("1") }], { handoff: "blocked" }).effects), ["reject"]);
  const clear = run({ ...initialRunState(), outbox: { ...EMPTY_OUTBOX, later: [row("次")] } }, [{ type: "send", when: "idle", message: msg("/clear") }]);
  assert.deepEqual(kinds(clear.effects), ["reply:sent", "clear_session", "start:message:次:queue"]);
});

test("伝える: 口がまだなら預かりの後ろに置いてすぐ預かったと答え、口ができたら頭から 1 件ずつ足す。足せたら外し、足せなければ入力が閉じたとして以後の「いま」は預かる（S03・S04・S08）", () => {
  const opening = run(turn({ tell: "opening" }), [now("あ"), now("い")]);
  assert.deepEqual([kinds(opening.effects), texts(opening.s, "now")], [["reply:held", "reply:held"], ["あ", "い"]]);
  const ready = run(opening.s, [{ type: "tell_ready", ready: true }]);
  assert.deepEqual(kinds(ready.effects), ["tell:あ"]);
  const id = (text: string) => ready.s.outbox.now.find((m) => m.text === text)!.id;
  const told = run(ready.s, [{ type: "tell_result", id: id("あ"), ok: true }]);
  assert.deepEqual([kinds(told.effects), texts(told.s, "now")], [["tell:い"], ["い"]]);
  const refused = run(told.s, [{ type: "tell_result", id: id("い"), ok: false }, now("う")]);
  assert.deepEqual([kinds(refused.effects), texts(refused.s, "now"), (refused.s.phase as TurnPhase).tell], [["reply:held"], ["い", "う"], "closed"]);
  // 作業していなければすぐ送る。作業中の /clear は予約。AI の交代の準備中は 409
  assert.deepEqual(kinds(run(initialRunState(), [now("ふつう")]).effects), ["reply:sent", "start:message:ふつう:user"]);
  assert.deepEqual(texts(run(turn(), [now("/clear")]).s, "later"), [""]);
  assert.deepEqual(kinds(run({ ...initialRunState(), phase: { kind: "preparing", why: "switch_provider", stopRequested: false } }, [now("x")]).effects), ["reject"]);
});

test("足すのと作業の終わりの行き違い（01 の 6.10 の 1）: 結果より先に作業が終わったら、行は預かりに残って次に新しい作業として出る。遅れて届いた結果は捨てる", () => {
  const telling = run(turn(), [now("あ")]);
  const id = telling.s.outbox.now[0].id;
  assert.deepEqual(kinds(telling.effects), ["reply:pending", "tell:あ"]);
  const crossed = run(telling.s, [ended]);
  assert.deepEqual(kinds(crossed.effects), ["refresh_usage", "start:message:あ:held"]);
  assert.deepEqual(run(crossed.s, [{ type: "tell_result", id, ok: true }]).s, crossed.s);
  // 結果が先なら、足したまま終わる（送信待ちの次へ）
  const first = run(telling.s, [{ type: "tell_result", id, ok: true }, ended]);
  assert.deepEqual([kinds(first.effects), texts(first.s, "now")], [["refresh_usage"], []]);
  // 足せなかったあとに終わったら、新しい作業として送る
  assert.deepEqual(kinds(run(telling.s, [{ type: "tell_result", id, ok: false }, ended]).effects).at(-1), "start:message:あ:held");
});

test("圧縮: 圧縮中・圧縮前指示から圧縮が終わるまでは預かり、足している途中の行も待たない。圧縮したら圧縮後指示を頭に置いて足し、そのやり取りの間の自分の指示は終わってから送る（S22・S23）", () => {
  const telling = run(turn(), [now("あ"), { type: "compacting", active: true, at: env.now, trigger: "auto" }]);
  assert.deepEqual([(telling.s.phase as TurnPhase).telling, (telling.s.phase as TurnPhase).compaction.running], [null, { since: env.now, trigger: "auto" }]);
  const compacted = run(telling.s, [now("い"), { type: "compacted", post: "読み直す", compactRun: false }, { type: "compacting", active: false, at: env.now, trigger: "auto" }]);
  assert.deepEqual([kinds(compacted.effects), texts(compacted.s, "now")], [["reply:held", "tell:読み直す"], ["読み直す", "あ", "い"]]);
  const post = compacted.s.outbox.now[0].id;
  const exchange = run(compacted.s, [{ type: "tell_result", id: post, ok: true }, now("う")]);
  assert.deepEqual([kinds(exchange.effects), texts(exchange.s, "now")], [["reply:held"], ["あ", "い", "う"]]);
  assert.deepEqual(kinds(run(exchange.s, [ended]).effects).at(-1), "start:message:あ:held");
  // 自動の圧縮の前に指示を足したら、圧縮が終わるまで預かる
  assert.deepEqual(kinds(run(turn(), [{ type: "pre_compact_injected" }, now("え")]).effects), ["reply:held"]);
});

test("圧縮を頼む: 作業中は圧縮前指示を足せれば足し（足せたら最後まで終わってから手で圧縮）、足せなければ予約。作業していなければ圧縮前指示の作業か /compact（会話がなければ 409）", () => {
  const e = { preCompact: "ノートを書いて" };
  assert.deepEqual(run(turn(), [{ type: "compact" }], e).effects, [{ do: "tell_pre_compact", text: "ノートを書いて" }]);
  const told = run(turn(), [{ type: "pre_compact_told", ok: true }], e).s.phase as TurnPhase;
  assert.deepEqual([told.compaction.awaiting, told.compaction.afterTurn], [true, true]);
  assert.deepEqual(run(turn(), [{ type: "pre_compact_told", ok: false }], e).s.outbox.later.map((m) => m.compact), [true]);
  assert.deepEqual(run(turn({ tell: "opening" }), [{ type: "compact" }], e).s.outbox.later.map((m) => m.compact), [true]);
  assert.deepEqual(kinds(run(initialRunState(), [{ type: "compact" }], e).effects), ["start:pre_compact:ノートを書いて:user"]);
  assert.deepEqual(kinds(run(initialRunState(), [{ type: "compact" }]).effects), ["start:compact::user"]);
  assert.deepEqual(kinds(run(initialRunState(), [{ type: "compact" }], { hasSession: false }).effects), ["reject"]);
  assert.deepEqual(kinds(run(initialRunState(), [{ type: "compact" }], { handoff: "ready" }).effects), ["reject"]);
});

test("送信待ち: 作業中は列に足し（質問として送ったらそのあとに線）、作業の終わりに頭から送る。線で待っていたのに線がなくなった・自動で送るに戻したら次を送る（S13・S31・S35）", () => {
  const queued = run(turn(), [{ type: "send", when: "later", message: msg("2"), pauseAfter: true }, later("/clear")]);
  assert.deepEqual([kinds(queued.effects), texts(queued.s, "later"), queued.s.outbox.stops], [["reply:queued", "reply:queued"], ["2", ""], [1]]);
  const stopped = { ...initialRunState(), outbox: { ...EMPTY_OUTBOX, later: [row("3")], stops: [0] } };
  assert.deepEqual(kinds(run(stopped, [{ type: "queue", command: { op: "set_stops", stops: [] } }]).effects), ["start:message:3:queue"]);
  const paused = { ...initialRunState(), outbox: { ...EMPTY_OUTBOX, later: [row("3")], paused: true }, gates: { recovery: null, restart: { interrupted: false, queued: true } } };
  const resumed = run(paused, [{ type: "queue", command: { op: "set_paused", paused: false } }]);
  assert.deepEqual([kinds(resumed.effects), resumed.s.gates.restart], [["start:message:3:queue"], null]);
  // 列にない行は 404（状態は変えない）
  assert.deepEqual(run(stopped, [{ type: "queue", command: { op: "remove", ids: ["x"] } }]).effects, [{ do: "reject", status: 404, message: "待ちの指示が見つかりません" }]);
});

test("書き直し: 次に送る指示を書き直している間は送らず、外れたら送る。預かりの頭を書き直している間も送らず、外れたら作業していなければ新しい作業として送る（S28・S33）", () => {
  const waiting = run({ ...turn(), outbox: { ...EMPTY_OUTBOX, later: [row("2")] } }, [{ type: "editing", lane: "later", ids: ["2"] }, ended]);
  assert.deepEqual(kinds(waiting.effects), ["edit_timer", "refresh_usage"]);
  assert.deepEqual(kinds(run(waiting.s, [{ type: "edit_hold_expired", lane: "later" }]).effects), ["edit_timer", "start:message:2:queue"]);
  const held = run({ ...initialRunState(), outbox: { ...EMPTY_OUTBOX, now: [row("い"), row("う")] } }, [{ type: "editing", lane: "now", ids: ["い"] }]);
  assert.deepEqual(kinds(held.effects), ["edit_timer"]);
  assert.deepEqual(kinds(run(held.s, [{ type: "queue", command: { op: "edit", id: "い", text: "直した" } }]).effects), ["edit_timer", "start:message:直した:held"]);
});

test("すぐ送る: 作業中の指示は止めずに伝え、圧縮・消去の行はすぐ行う（作業していなくて会話がなければ 409 で列に残す）。すべて送るはまとめて 1 件にする（S04・S35）", () => {
  const box = { ...EMPTY_OUTBOX, later: [row("2"), row("3"), row("[消去]", { clear: true })] };
  assert.deepEqual(kinds(run({ ...turn(), outbox: box }, [{ type: "queue_send", mode: "now", id: "3" }]).effects), ["reply:pending", "tell:3"]);
  assert.deepEqual(kinds(run({ ...initialRunState(), outbox: box }, [{ type: "queue_send", mode: "now", id: "[消去]" }], { hasSession: false }).effects), ["reject"]);
  const all = run({ ...initialRunState(), outbox: box }, [{ type: "queue_send", mode: "all" }]);
  assert.deepEqual([kinds(all.effects), texts(all.s, "later")], [["reply:sent", "start:message:2\n\n3:user"], ["[消去]"]]);
  assert.deepEqual(kinds(run(initialRunState(), [{ type: "queue_send", mode: "in_order" }]).effects), ["reject"]);
});

test("止める・長い準備: 作業中は止める命令。親の会話を写している間に止めたら、動かし始めたらすぐ止める。準備が済んだら送信待ちの次・預かりの頭を送る（S09）", () => {
  const stop = run(turn(), [{ type: "cancel" }]);
  assert.deepEqual([kinds(stop.effects), (stop.s.phase as TurnPhase).stopRequested], [["abort_turn"], true]);
  const inherit = run(initialRunState(), [{ type: "begin", why: "inherit" }, now("いま"), { type: "cancel" }, { type: "turn_started", turn: "message", compactBy: null }]);
  assert.deepEqual([kinds(inherit.effects), (inherit.s.phase as TurnPhase).stopRequested], [["reply:held", "abort_turn"], true]);
  assert.deepEqual(run(initialRunState(), [{ type: "cancel" }]).effects, []);
  const box = { ...EMPTY_OUTBOX, now: [row("いま")], later: [row("次")] };
  assert.deepEqual(kinds(run({ ...initialRunState(), outbox: box }, [{ type: "begin", why: "move_workplace" }, { type: "prepared", next: "deliver" }]).effects), ["start:message:いま:held"]);
  assert.deepEqual(kinds(run({ ...initialRunState(), outbox: { ...box, now: [] } }, [{ type: "begin", why: "switch_provider" }, { type: "prepared", next: "send_next" }]).effects), ["start:message:次:queue"]);
});

test("準備の間・作業の終わりにすることの間に止めると、済んでも動かさない（送る準備は動かし始めたらすぐ中断。6 章 A8・S52）", () => {
  const preparing = (why: "send" | "move_workplace"): ChatRunState => ({ ...initialRunState(), outbox: { ...EMPTY_OUTBOX, later: [row("次")], now: [row("いま")] }, phase: { kind: "preparing", why, stopRequested: false } });
  const sending = run(preparing("send"), [{ type: "cancel" }, { type: "turn_started", turn: "message", compactBy: null }]);
  assert.deepEqual(kinds(sending.effects), ["abort_turn"]);
  assert.equal(sending.s.phase.kind === "turn" && sending.s.phase.stopRequested, true);
  const moved = run(preparing("move_workplace"), [{ type: "cancel" }, { type: "prepared", next: "deliver" }]);
  assert.deepEqual([kinds(moved.effects), moved.s.phase, texts(moved.s, "now"), texts(moved.s, "later")], [[], { kind: "idle" }, ["いま"], ["次"]]);
  // 作業の終わりにすること（予約した移動）の間に止めた: 済んだら預かりは送信待ちの頭へ置き、何も送らない
  const settling: ChatRunState = { ...preparing("send"), phase: { kind: "settling", then: { compact: null, send: true }, stopRequested: false } };
  const settled = run(settling, [{ type: "cancel" }, { type: "settled" }]);
  assert.deepEqual([kinds(settled.effects), settled.s.phase, texts(settled.s, "now"), texts(settled.s, "later")], [[], { kind: "idle" }, [], ["いま", "次"]]);
});
