// 作業の終わりの決まり（onTurnEnded・afterTurn）の表。筋書き S13〜S16・S24〜S26・S36・S47 の作業の終わりの部分を、命令の列で比べる
import assert from "node:assert/strict";
import { test } from "vitest";
import { EMPTY_OUTBOX, newMessage, type Outbox } from "@shared/chat/outbox";
import { noCompaction } from "./state";
import { afterTurn, onTurnEnded } from "./turnEnd";
import type { ChatRunState, Compaction, Effect, Env, Gates, TurnKind, TurnOutcome } from "./types";

const env: Env = { now: "2026-11-22T00:00:00.000Z", newId: () => "new", shuttingDown: false, hasSession: true, hasTurnEndTasks: false, handoff: null, handoffQueued: [], preCompact: null, preCompactSent: false, autoResumeOnReconnect: true, chatFailed: false };
const row = (text: string, extra: object = {}) => ({ ...newMessage(env, text, {}, []), id: text, ...extra });
const later = (...texts: string[]): Outbox => ({ ...EMPTY_OUTBOX, later: texts.map((t) => row(t)) });
const completed: TurnOutcome = { status: "completed", network: false };
const network: TurnOutcome = { status: "failed", network: true };
const usage: TurnOutcome = { status: "failed", network: false, usageLimit: { resetsAt: null } };

/** 終わった作業の状態（種類・圧縮の様子・出す箱・門） */
function ended({ turn = "message", compaction = {}, outbox = EMPTY_OUTBOX, gates = {} }: { turn?: TurnKind; compaction?: Partial<Compaction>; outbox?: Outbox; gates?: Partial<Gates> } = {}): ChatRunState {
  return { phase: { kind: "turn", id: "t", turn, tell: "open", compaction: { ...noCompaction(), ...compaction }, stopRequested: false, telling: null, compactBy: null }, outbox, editing: { now: [], later: [] }, gates: { recovery: null, restart: null, ...gates } };
}

const end = (s: ChatRunState, outcome: TurnOutcome, e: Partial<Env> = {}) => onTurnEnded(s, outcome, { ...env, ...e });
const head = (_outcome: TurnOutcome): Effect[] => [{ do: "refresh_usage" }];
const gate = { reason: "reconnect" as const, holds: true, attempts: 0, agents: {}, step: { at: "idle" as const } };
const sendNext = (text: string): Effect => ({ do: "start_turn", turn: "message", item: row(text), from: "queue" });

test("作業の終わり: 止めた・失敗しても送信待ちの次を送る（S13・S14）。作業中は取り出さず、終わってから送る（S36）", () => {
  for (const outcome of [completed, { status: "cancelled", network: false }, { status: "failed", network: false }] as TurnOutcome[]) {
    const { state, effects } = end(ended({ outbox: later("次") }), outcome);
    assert.deepEqual(effects, [...head(outcome), sendNext("次")]);
    assert.deepEqual([state.phase, state.outbox.later], [{ kind: "preparing", why: "send", stopRequested: false }, []]);
  }
});

test("作業の終わり: 通信の切断・使用枠の上限・アプリの終了では送らず、送信待ちは門で止める（S15。paused は書かない）。引き継ぎを確かめるまでは再開の段取りにも入らない", () => {
  const cut = end(ended({ outbox: later("次") }), network);
  assert.deepEqual([cut.state.gates.recovery?.reason, cut.state.gates.recovery?.holds, cut.state.outbox.paused, cut.state.phase.kind], ["reconnect", true, false, "idle"]);
  assert.equal(end(ended({ outbox: later("次") }), usage).state.gates.recovery?.reason, "usage_limit");
  assert.deepEqual(end(ended({ outbox: later("次") }), completed, { shuttingDown: true }).effects, head(completed));
  assert.deepEqual(end(ended({ outbox: later("次") }), completed, { handoff: "blocked" }).effects, [{ do: "refresh_usage" }]);
  assert.deepEqual(end(ended({ outbox: later("次") }), completed, { handoff: "ready" }).effects, [...head(completed), sendNext("次")]);
  // 門で止めた送信待ち: 最後まで終わったら外して送る。止めた・失敗したら外して利用者が止めたものにする
  assert.deepEqual(end(ended({ outbox: later("次"), gates: { recovery: gate } }), completed).effects.at(-1), sendNext("次"));
  const failed = end(ended({ outbox: later("次"), gates: { recovery: gate } }), { status: "failed", network: false });
  assert.deepEqual([failed.state.gates.recovery, failed.state.outbox.paused, failed.effects], [null, true, head({ status: "failed", network: false })]);
});

test("作業の終わり: 圧縮前指示の作業が最後まで終わって圧縮していなければ、続けて圧縮する（手で頼んだ前の指示は手で）。止めた・失敗したら圧縮しない", () => {
  const compact = (trigger: "auto" | "manual"): Effect => ({ do: "start_turn", turn: "compact", item: null, trigger, from: "user" });
  assert.deepEqual(end(ended({ compaction: { awaiting: true }, outbox: later("次") }), completed).effects.at(-1), compact("auto"));
  assert.deepEqual(end(ended({ turn: "pre_compact", compaction: { awaiting: true } }), completed).effects.at(-1), compact("manual"));
  assert.deepEqual(end(ended({ compaction: { awaiting: true, afterTurn: true } }), completed).effects.at(-1), compact("manual"));
  // 手で頼んだ前の指示の作業の中で自動の圧縮が済んだ（待つ間が外れた）: もう圧縮しない（S47・6 章 A5）。手で圧縮する実行そのものも続けて圧縮しない
  assert.deepEqual(end(ended({ turn: "pre_compact", compaction: { done: true }, outbox: later("次") }), completed).effects.at(-1), sendNext("次"));
  assert.deepEqual(end(ended({ turn: "compact", compaction: { awaiting: true }, outbox: later("次") }), completed).effects.at(-1), sendNext("次"));
  const failed: TurnOutcome = { status: "failed", network: false };
  assert.deepEqual(end(ended({ compaction: { awaiting: true }, outbox: later("次") }), failed).effects, [...head(failed), sendNext("次")]);
});

test("作業の終わりの順: 予約した作業場所の移動 → 続けての圧縮 → 預かり → 送信待ち（S16）。止めたら移さずに予約を消す", () => {
  const withTasks = { hasTurnEndTasks: true };
  const moving = end(ended({ turn: "pre_compact", compaction: { awaiting: true } }), completed, withTasks);
  assert.deepEqual(moving.effects, [...head(completed), { do: "run_turn_end_tasks" }]);
  // 移す間は作業中のまま（作業の終わりにすることが済むのを待つ段階。chats.status は済んでから書く = 6 章 A1）
  assert.deepEqual(moving.state.phase, { kind: "settling", then: { compact: "manual", send: true }, stopRequested: false });
  // 移したあとに続きの指示（預かりの前）を置いたら、それから送る
  const effects: Effect[] = [];
  const settled = afterTurn({ ...moving.state, phase: { kind: "idle" }, outbox: { ...EMPTY_OUTBOX, now: [row("続き")] } }, { compact: null, send: true }, env, effects);
  assert.deepEqual([effects, settled.outbox.now], [[{ do: "start_turn", turn: "message", item: row("続き"), from: "held" }], []]);
  const cancelled: TurnOutcome = { status: "cancelled", network: false };
  assert.deepEqual(end(ended({ outbox: later("次") }), cancelled, withTasks).effects, [...head(cancelled), { do: "drop_turn_end_tasks", notice: true }, sendNext("次")]);
  assert.deepEqual(end(ended(), completed, { ...withTasks, shuttingDown: true }).effects, [...head(completed), { do: "drop_turn_end_tasks", notice: false }]);
});

test("作業の終わり: 預かりは送信待ちより先に送り（1 件目が圧縮後指示ならその作業として）、送れない終わり方なら置いておく（S24・S25・S26）", () => {
  const held = { ...later("前から"), now: [row("後", { post_compact: true }), row("A"), row("B")] };
  const sent = end(ended({ outbox: held }), completed);
  assert.deepEqual(sent.effects.at(-1), { do: "start_turn", turn: "post_compact", item: row("後", { post_compact: true }), from: "held" });
  assert.deepEqual(sent.state.outbox.now.map((m) => m.text), ["A", "B"]);
  // 置き方: 自分の指示は送信待ちの頭へ（前からの送信待ちより先・送った順）、圧縮後指示は預かりに残して次の作業に伝える
  let n = 0;
  const parked = end(ended({ outbox: held }), network, { newId: () => `p${++n}` }).state.outbox;
  assert.deepEqual([parked.now.map((m) => m.text), parked.later.map((m) => [m.id, m.text])], [["後"], [["p1", "A"], ["p2", "B"], ["前から", "前から"]]]);
});
