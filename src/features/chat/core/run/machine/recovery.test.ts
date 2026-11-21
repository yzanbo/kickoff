// 止まったあとの再開の決まり（recovery.ts）の表: 作業の終わり・つながった・時計・答えを順に渡し、門と命令を比べる（殻の見張り・カード・送るは網 S11・S12・S37〜S42）
import assert from "node:assert/strict";
import { test } from "vitest";
import { EMPTY_OUTBOX, newMessage } from "@shared/chat/outbox";
import { RESTART_RESUME_PROMPT } from "@shared/chat/prompts";
import { step } from "./step";
import { initialRunState } from "./state";
import { MAX_AUTO_RESUMES, reconnectStateOf } from "./recovery";
import type { ChatRunState, Effect, Env, RunEvent, TurnOutcome } from "./types";

const RESET = "2026-11-04T10:30:00.000Z";
const env: Env = { now: RESET, newId: () => "n", shuttingDown: false, hasSession: true, hasTurnEndTasks: false, providerHandoff: null, providerHandoffQueued: [], preCompact: null, preCompactSent: false, autoResumeOnReconnect: true, chatFailed: true };
const row = (text: string) => ({ ...newMessage(env, text, {}, []), id: text });
/** 送信待ちに 1 件ある作業中の状態 */
const working = (extra: Partial<ChatRunState> = {}): ChatRunState => ({ ...initialRunState(), outbox: { ...EMPTY_OUTBOX, later: [row("次")] }, phase: { kind: "turn", id: "t", turn: "message", tell: "open", compaction: { awaiting: false, afterTurn: false, running: null, done: false }, stopRequested: false, telling: null, compactBy: null }, ...extra });
function run(s: ChatRunState, events: RunEvent[], e: Partial<Env> = {}): { s: ChatRunState; effects: Effect[] } {
  const effects: Effect[] = [];
  for (const event of events) {
    const done = step(s, event, { ...env, ...e });
    s = done.state;
    effects.push(...done.effects);
  }
  return { s, effects };
}
const end = (outcome: TurnOutcome): RunEvent => ({ type: "turn_ended", outcome });
const usage = (resetsAt: string | null) => end({ status: "failed", network: false, usageLimit: { resetsAt } });
const network = end({ status: "failed", network: true });
const kinds = (effects: Effect[]) => effects.map((e) => (e.do === "record" ? `notice:${e.message}` : e.do === "watch" ? `watch:${e.what}` : e.do === "start_turn" ? `start:${e.item?.text}` : e.do));
const turnAgain = (s: ChatRunState): ChatRunState => ({ ...s, phase: working().phase });

test("使用枠の上限: 送信待ちを門で止め、戻る時刻（＋1 分）を時計で見てから聞く。再開して最後まで終わったら門を外して送る（S41）", () => {
  const stopped = run(working(), [usage(RESET)]);
  assert.match(kinds(stopped.effects).join("|"), /枠が戻ったら、続けるかを確かめます。送信待ちは止めてあります。\|watch:clock/);
  assert.deepEqual([stopped.s.gates.recovery?.holds, stopped.s.outbox.paused], [true, false]);
  assert.deepEqual(run(stopped.s, [{ type: "clock", now: Date.parse(RESET) + 59_000 }]).effects, []);
  const asked = run(stopped.s, [{ type: "clock", now: Date.parse(RESET) + 60_000 }]);
  assert.deepEqual([kinds(asked.effects), asked.s.gates.recovery?.step], [["ask_recovery"], { at: "asking" }]);
  const resumed = run(asked.s, [{ type: "answer_recovery", allow: true }]);
  assert.deepEqual(resumed.effects, [{ do: "resume_recovery", reason: "usage_limit", agents: [] }]);
  const done = run(turnAgain(run(resumed.s, [{ type: "recovery_resumed" }]).s), [end({ status: "completed", network: false })]);
  assert.deepEqual([done.s.gates.recovery, kinds(done.effects).at(-1)], [null, "start:次"]);
});

test("続けて別の理由で止まったら、前の段取りを置き換え、止めた送信待ちを引き継ぐ（聞いていたら取り下げる。S42）", () => {
  const asked = run(working(), [usage(RESET), { type: "clock", now: Date.parse(RESET) + 120_000 }]);
  const cut = run(turnAgain(asked.s), [network]);
  assert.deepEqual(kinds(cut.effects), ["refresh_usage", "withdraw_ask", "notice:通信が切れたため止まりました。つながったら自動で再開します。", "watch:online"]);
  assert.deepEqual([cut.s.gates.recovery?.holds, reconnectStateOf(cut.s.gates.recovery)], [true, { attempts: 0, max: MAX_AUTO_RESUMES, agents: [] }]);
  assert.deepEqual(run(cut.s, [{ type: "online" }]).effects, [{ do: "resume_recovery", reason: "reconnect", agents: [] }]);
});

test("通信の切断: 再開しても続かなければ回数を数え、上限で聞く。止まったサブエージェントは続く間だけ覚える。自分で止めていた・設定がオフならお知らせだけ（S37〜S40）", () => {
  let s = working();
  for (let n = 0; n < MAX_AUTO_RESUMES; n++) s = turnAgain(run(s, [end({ status: "failed", network: true, stoppedAgents: n === 0 ? [{ agentId: "a1", description: "調査" }] : [] }), { type: "online" }, { type: "recovery_resumed" }]).s);
  assert.deepEqual([s.gates.recovery?.attempts, s.gates.recovery?.agents], [MAX_AUTO_RESUMES, { a1: "調査" }]);
  assert.deepEqual(kinds(run(s, [network]).effects), ["refresh_usage", "ask_recovery"]);
  const paused = run(working({ outbox: { ...EMPTY_OUTBOX, later: [row("次")], paused: true } }), [network]);
  assert.deepEqual([kinds(paused.effects).at(-1), paused.s.gates.recovery?.holds], ["notice:通信が切れたため止まりました。つながってからメッセージを送ると、続きから再開できます。", false]);
  assert.deepEqual(kinds(run(working(), [network], { autoResumeOnReconnect: false }).effects).length, 2);
  // 自分で動かしていれば（失敗のままでない・作業中）、再開もしない
  assert.deepEqual(run(run(working(), [network]).s, [{ type: "online" }], { chatFailed: false }).s.gates.recovery?.step, { at: "idle" });
});

test("使用枠の上限: AI が戻る時刻を知らせなければ調べてから待つ。調べている間に自分で送ったらやめる。「自動で再開しない」はつながるのを待っているときだけ", () => {
  const lookup = run(working(), [usage(null)]);
  assert.deepEqual(kinds(lookup.effects), ["refresh_usage", "lookup_limit"]);
  const found = run(lookup.s, [{ type: "limit_found", at: RESET }]);
  assert.deepEqual(kinds(found.effects).at(-1), "watch:clock");
  const forgot = run(lookup.s, [{ type: "forget_recovery" }, { type: "limit_found", at: RESET }]);
  assert.deepEqual([forgot.effects, forgot.s.gates.recovery, forgot.s.outbox.paused], [[], null, true]);
  assert.deepEqual(kinds(run(found.s, [{ type: "stop_reconnect" }]).effects), ["reject"]);
  const waiting = run(working(), [network]).s;
  assert.deepEqual(run(waiting, [{ type: "stop_reconnect" }]).s.gates.recovery?.step, { at: "idle" });
});

test("起動したときの確かめに答える: 送る（送信待ちの次）・続ける（中断した作業を続けるよう頼む）・止めておく。自分で送ったら作業を続けるかはもう聞かない（S43〜S44）", () => {
  const waiting: ChatRunState = { ...initialRunState(), outbox: { ...EMPTY_OUTBOX, later: [row("次")] }, gates: { recovery: null, restart: { interrupted: true, queued: true } } };
  const answer = (action: "send" | "continue" | "pause") => run(waiting, [{ type: "answer_restart", action, agents: [] }]);
  assert.deepEqual([kinds(answer("send").effects), answer("send").s.gates.restart], [["resume_pending", "start:次"], null]);
  assert.deepEqual(kinds(answer("continue").effects), ["resume_pending", "reply", `start:${RESTART_RESUME_PROMPT}`]);
  assert.deepEqual([answer("pause").s.outbox.paused, answer("pause").effects.length], [true, 1]);
  assert.deepEqual(run(waiting, [{ type: "forget_interrupted" }]).s.gates.restart, { interrupted: false, queued: true });
});
