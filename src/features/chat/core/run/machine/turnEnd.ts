// 作業の終わりに次にすることを決める純粋な関数（命令は殻の Runner が実行する）
import { deliverNow, parkNow, pumpLater, startCompact } from "./outbox";
import { recoveryOnEnd } from "./recovery";
import { handoffAllows } from "./state";
import type { AfterTurn, ChatRunState, Effect, Env, Step, TurnOutcome } from "./types";

/** 止まったあとの再開の段取りに入らず、預かり・送信待ちを送ってよい終わり方か（通信の切断・使用枠の上限では送らない。送っても失敗して消えるため） */
export function canSendAfter(outcome: TurnOutcome): boolean {
  return !outcome.network && !outcome.usageLimit;
}

/**
 * 作業が終わった（状態の phase は終わった作業）。次の順に決める:
 * 1. 引き継ぎを確かめるまでの AI の切り替えでなければ、止まったあとの再開の段取り（recovery.ts）。送ってよいのは、それに入らず、アプリを終えるところでもないとき
 * 2. 圧縮前指示の作業が最後まで終わって、まだ圧縮していなければ（圧縮前指示から圧縮が終わるまでの間が残っていれば）、続けて圧縮する（次の指示を送ると、
 *    その初めに圧縮されて、指示が圧縮より上に出るため）。手で頼んだ前の指示の作業の中で自動の圧縮が済んでいれば、もう圧縮しない。止めた・失敗したときは圧縮しない
 * 3. AI が予約した作業場所の移動: 最後まで終わったら、いつもの続きより先に移す（済んだら settled）。止めた・失敗したら移さずに予約を消す
 * 4. 続き（afterTurn）: 続けての圧縮 → 預かった「いま」（送信待ちより先）→ 送信待ちの次（止めた・失敗したときも送る）
 */
export function onTurnEnded(s: ChatRunState, outcome: TurnOutcome, env: Env): Step {
  const ended = s.phase.kind === "turn" ? s.phase : null;
  const handoff = handoffAllows(env.handoff);
  const send = handoff && canSendAfter(outcome) && !env.shuttingDown;
  const completed = send && outcome.status === "completed";
  const compactNext = completed && ended !== null && ended.turn !== "compact" && ended.compaction.awaiting;
  const manual = ended !== null && (ended.turn === "pre_compact" || ended.compaction.afterTurn);
  const then: AfterTurn = { compact: compactNext ? (manual ? "manual" : "auto") : null, send };
  const effects: Effect[] = [{ do: "refresh_usage" }];
  const idle: ChatRunState = { ...s, phase: { kind: "idle" } };
  const state = handoff ? recoveryOnEnd(idle, outcome, env, effects) : idle;
  if (env.hasTurnEndTasks && completed) return { state, effects: [...effects, { do: "run_turn_end_tasks", then }] };
  if (env.hasTurnEndTasks) effects.push({ do: "drop_turn_end_tasks", notice: !env.shuttingDown });
  return { state: afterTurn(state, then, env, effects), effects };
}

/** 続き: 続けての圧縮 → 預かった「いま」（送れない終わり方なら送信待ちの頭へ置く）→ 送信待ちの次 */
export function afterTurn(s: ChatRunState, then: AfterTurn, env: Env, effects: Effect[]): ChatRunState {
  if (then.compact) return startCompact(s, env, then.compact, effects);
  if (s.outbox.now.length > 0) return then.send ? deliverNow(s, effects) : { ...s, outbox: parkNow(s.outbox, env) };
  return then.send ? pumpLater(s, env, effects) : s;
}
