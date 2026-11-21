// 作業の終わりの決まり（onTurnEnded・onSettled）の表。筋書き S13〜S16・S24〜S26・S36 の作業の終わりの部分を、命令の列で比べる
import assert from "node:assert/strict";
import { test } from "vitest";
import { addLater, EMPTY_OUTBOX, newMessage, type Outbox } from "@shared/chat/outbox";
import { parkNow } from "./outbox";
import { onSettled, onTurnEnded } from "./turnEnd";
import type { ChatRunState, Compaction, Effect, Env, TurnKind, TurnOutcome } from "./types";

const env = { now: "2026-11-22T00:00:00.000Z", newId: () => "new" };
const row = (text: string, extra: object = {}) => ({ ...newMessage(env, text, {}, []), id: text, ...extra });
const completed: TurnOutcome = { status: "completed", network: false };

/** 終わった作業の状態（種類・圧縮の様子・出す箱・引き継ぎの門） */
function ended({ turn = "message", compaction = {}, outbox = EMPTY_OUTBOX, handoff = null }: { turn?: TurnKind; compaction?: Partial<Compaction>; outbox?: Outbox; handoff?: ChatRunState["gates"]["handoff"] } = {}): ChatRunState {
  const c = { awaiting: false, afterTurn: false, running: null, done: false, ...compaction };
  return { phase: { kind: "turn", turn, compaction: c }, outbox, gates: { handoff }, awaitingCompact: c.awaiting };
}

const effectsOf = (s: ChatRunState, outcome: TurnOutcome, e: Partial<Env> = {}) => onTurnEnded(s, outcome, { shuttingDown: false, hasTurnEndTasks: false, ...e }).effects;
const head = (outcome: TurnOutcome): Effect[] => [{ do: "end_recovery", outcome }, { do: "refresh_usage" }];

test("作業の終わり: 止めた・失敗しても送信待ちの次を送る（S13・S14）。作業中は取り出さず、終わってから送る（S36）", () => {
  for (const outcome of [completed, { status: "cancelled", network: false }, { status: "failed", network: false }] as TurnOutcome[]) {
    assert.deepEqual(effectsOf(ended(), outcome), [...head(outcome), { do: "send_next" }]);
  }
});

test("作業の終わり: 通信の切断・使用枠の上限・アプリの終了では送らない（S15）。引き継ぎを確かめるまでは再開の段取りにも入らない", () => {
  const network: TurnOutcome = { status: "failed", network: true };
  const usage: TurnOutcome = { status: "failed", network: false, usageLimit: { resetsAt: null } };
  assert.deepEqual(effectsOf(ended(), network), head(network));
  assert.deepEqual(effectsOf(ended(), usage), head(usage));
  assert.deepEqual(effectsOf(ended(), completed, { shuttingDown: true }), head(completed));
  assert.deepEqual(effectsOf(ended({ handoff: "blocked" }), completed), [{ do: "refresh_usage" }]);
  assert.deepEqual(effectsOf(ended({ handoff: "ready" }), completed), [...head(completed), { do: "send_next" }]);
});

test("作業の終わり: 圧縮前指示の作業が最後まで終わって圧縮していなければ、続けて圧縮する（手で頼んだ前の指示は手で）。止めた・失敗したら圧縮せず、待つ間も終わる", () => {
  const auto = onTurnEnded(ended({ compaction: { awaiting: true } }), completed, { shuttingDown: false, hasTurnEndTasks: false });
  assert.deepEqual(auto.effects.at(-1), { do: "start_turn", turn: "compact", trigger: "auto" });
  assert.equal(auto.state.awaitingCompact, true);
  assert.deepEqual(effectsOf(ended({ turn: "pre_compact" }), completed).at(-1), { do: "start_turn", turn: "compact", trigger: "manual" });
  assert.deepEqual(effectsOf(ended({ compaction: { awaiting: true, afterTurn: true } }), completed).at(-1), { do: "start_turn", turn: "compact", trigger: "manual" });
  // 手で圧縮する実行そのものは、続けて圧縮しない
  assert.deepEqual(effectsOf(ended({ turn: "compact", compaction: { awaiting: true } }), completed).at(-1), { do: "send_next" });
  const failed: TurnOutcome = { status: "failed", network: false };
  const stopped = onTurnEnded(ended({ compaction: { awaiting: true } }), failed, { shuttingDown: false, hasTurnEndTasks: false });
  assert.deepEqual(stopped.effects, [...head(failed), { do: "send_next" }]);
  assert.equal(stopped.state.awaitingCompact, false);
});

test("作業の終わりの順: 予約した作業場所の移動 → 続けての圧縮 → 預かり → 送信待ち（S16）。止めたら移さずに予約を消す", () => {
  const withTasks = { shuttingDown: false, hasTurnEndTasks: true };
  const moving = onTurnEnded(ended({ turn: "pre_compact" }), completed, withTasks);
  assert.deepEqual(moving.effects, [...head(completed), { do: "run_turn_end_tasks" }]);
  assert.deepEqual(moving.state.phase, { kind: "settling", task: "workplace_move", then: { compact: "manual", send: true } });
  assert.deepEqual(onSettled(moving.state).effects, [{ do: "start_turn", turn: "compact", trigger: "manual" }]);
  // 移したあとに続きの指示（預かりの前）を置いたら、それから送る
  const plain = onTurnEnded(ended(), completed, withTasks);
  assert.deepEqual(onSettled(plain.state).effects, [{ do: "send_next" }]);
  assert.deepEqual(onSettled({ ...plain.state, outbox: { ...EMPTY_OUTBOX, now: [row("続き")] } }), { state: { ...plain.state, phase: { kind: "idle" }, outbox: { ...EMPTY_OUTBOX, now: [row("続き")] } }, effects: [{ do: "deliver_held", sendNow: true }] });
  const cancelled: TurnOutcome = { status: "cancelled", network: false };
  assert.deepEqual(effectsOf(ended(), cancelled, { hasTurnEndTasks: true }), [...head(cancelled), { do: "drop_turn_end_tasks", notice: true }, { do: "send_next" }]);
  assert.deepEqual(effectsOf(ended(), completed, { hasTurnEndTasks: true, shuttingDown: true }), [...head(completed), { do: "drop_turn_end_tasks", notice: false }]);
});

test("作業の終わり: 預かりは送信待ちより先に送り、送れない終わり方なら置いておく（S24・S25・S26）", () => {
  const held = { ...EMPTY_OUTBOX, now: [row("後", { post_compact: true }), row("A"), row("B")] };
  assert.deepEqual(effectsOf(ended({ outbox: held }), completed).at(-1), { do: "deliver_held", sendNow: true });
  const network: TurnOutcome = { status: "failed", network: true };
  assert.deepEqual(effectsOf(ended({ outbox: held }), network).at(-1), { do: "deliver_held", sendNow: false });
  // 置き方: 自分の指示は送信待ちの頭へ（前からの送信待ちより先・送った順）、圧縮後指示は預かりに残して次の作業に伝える
  const parked = parkNow({ ...held, later: addLater(EMPTY_OUTBOX, row("前から")).later }, { now: env.now, newId: (() => { let n = 0; return () => `p${++n}`; })() });
  assert.deepEqual([parked.now.map((m) => m.text), parked.later.map((m) => [m.id, m.text])], [["後"], [["p1", "A"], ["p2", "B"], ["前から", "前から"]]]);
});
