// 作業の終わりに次にすることを決める純粋な関数（いまの Runner.execute の終わりの分岐。命令は殻の Runner が実行する）
import { handoffAllows } from "./outbox";
import type { AfterTurn, ChatRunState, Effect, Env, TurnOutcome } from "./types";

/** 止まったあとの再開の段取りに入らず、預かり・送信待ちを送ってよい終わり方か（通信の切断・使用枠の上限では送らない。送っても失敗して消えるため） */
export function recoveryOnEnd(outcome: TurnOutcome): boolean {
  return !outcome.network && !outcome.usageLimit;
}

/**
 * 作業が終わった（状態の phase は終わった作業）。次の順に決める:
 * 1. 引き継ぎを確かめるまでの AI の切り替えでなければ、止まったあとの再開の段取り（送信待ちを止める・戻す）。送ってよいのは、それに入らず、アプリを終えるところでもないとき
 * 2. 圧縮前指示の作業が最後まで終わって、まだ圧縮していなければ、続けて圧縮する（手で頼んだ圧縮の前の指示と、自動の圧縮の前の指示で作業の区切りまで圧縮が来なかったもの。
 *    次の指示を送ると、その初めに圧縮されて、指示が圧縮より上に出るため）。止めた・失敗したときは圧縮しない（圧縮前指示から圧縮までの間も終わる）
 * 3. AI が予約した作業場所の移動: 最後まで終わったら、いつもの続きより先に移す（済んだら onSettled）。止めた・失敗したら移さずに予約を消す
 * 4. 続き（afterTurn）: 続けての圧縮 → 預かった「いま」（送信待ちより先）→ 送信待ちの次（止めた・失敗したときも送る）
 */
export function onTurnEnded(s: ChatRunState, outcome: TurnOutcome, env: Env): { state: ChatRunState; effects: Effect[] } {
  const ended = s.phase.kind === "turn" ? s.phase : null;
  const handoff = handoffAllows(s.gates.handoff);
  const send = handoff && recoveryOnEnd(outcome) && !env.shuttingDown;
  const completed = send && outcome.status === "completed";
  const compactNext = completed && ended !== null && ended.turn !== "compact" && (ended.turn === "pre_compact" || ended.compaction.awaiting);
  const manual = ended !== null && (ended.turn === "pre_compact" || ended.compaction.afterTurn);
  const then: AfterTurn = { compact: compactNext ? (manual ? "manual" : "auto") : null, send };
  const effects: Effect[] = [...(handoff ? [{ do: "end_recovery" as const, outcome }] : []), { do: "refresh_usage" }];
  const state = { ...s, awaitingCompact: compactNext && s.awaitingCompact };
  if (env.hasTurnEndTasks && completed) return { state: { ...state, phase: { kind: "settling", task: "workplace_move", then } }, effects: [...effects, { do: "run_turn_end_tasks" }] };
  if (env.hasTurnEndTasks) effects.push({ do: "drop_turn_end_tasks", notice: !env.shuttingDown });
  return { state: { ...state, phase: { kind: "idle" } }, effects: [...effects, ...afterTurn(state.outbox, then)] };
}

/** 作業の終わりにすることが済んだ（状態の phase は settling）。決めておいた続きを、いまの出す箱で行う */
export function onSettled(s: ChatRunState): { state: ChatRunState; effects: Effect[] } {
  const then = s.phase.kind === "settling" ? s.phase.then : { compact: null, send: false };
  return { state: { ...s, phase: { kind: "idle" } }, effects: afterTurn(s.outbox, then) };
}

/** 続き: 続けての圧縮 → 預かった「いま」（送れない終わり方なら送信待ちの頭へ置く）→ 送信待ちの次 */
function afterTurn(outbox: ChatRunState["outbox"], then: AfterTurn): Effect[] {
  if (then.compact) return [{ do: "start_turn", turn: "compact", trigger: then.compact }];
  if (outbox.now.length > 0) return [{ do: "deliver_held", sendNow: then.send }];
  return then.send ? [{ do: "send_next" }] : [];
}
