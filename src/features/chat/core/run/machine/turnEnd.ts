// 作業の終わりに次にすることを決める純粋な関数（命令は殻の Runner が実行する）
import { setPaused } from "@shared/chat/outbox";
import { deliverNow, parkNow, pumpLater, startCompact } from "./outbox";
import { handoffAllows } from "./state";
import type { AfterTurn, ChatRunState, Effect, Env, Step, TurnOutcome } from "./types";

/** 止まったあとの再開の段取りに入らず、預かり・送信待ちを送ってよい終わり方か（通信の切断・使用枠の上限では送らない。送っても失敗して消えるため） */
export function recoveryOnEnd(outcome: TurnOutcome): boolean {
  return !outcome.network && !outcome.usageLimit;
}

/**
 * 作業の終わりの、再開の段取りが止める送信待ちの門: 通信の切断・使用枠の上限で止まったら、送信待ちを送らずに門で止める（利用者が止めていたものはそのまま。
 * paused は書かない = 門は保存しないので、アプリを終えたら外れ、起動したときの確かめで聞く）。最後まで終わったら門を外して送る。
 * 止めた・ほかの理由で失敗したら、門を外して利用者が止めたものにする（自分で戻せる）
 */
export function recoveryGateOnEnd(s: ChatRunState, outcome: TurnOutcome): ChatRunState {
  const reason = outcome.network ? "reconnect" : outcome.usageLimit ? "usage_limit" : null;
  if (reason) return s.outbox.later.length > 0 && !s.outbox.paused ? { ...s, gates: { ...s.gates, recovery: reason } } : s;
  return releaseRecovery(s, outcome.status !== "completed");
}

/** 再開の段取りが止めた送信待ちの門を外す（keepPaused: 利用者が止めたものにして止めたままにする） */
export function releaseRecovery(s: ChatRunState, keepPaused: boolean): ChatRunState {
  if (s.gates.recovery === null) return s;
  return { ...s, outbox: keepPaused ? setPaused(s.outbox, true) : s.outbox, gates: { ...s.gates, recovery: null } };
}

/**
 * 作業が終わった（状態の phase は終わった作業）。次の順に決める:
 * 1. 引き継ぎを確かめるまでの AI の切り替えでなければ、止まったあとの再開の段取り（送信待ちの門を立てる・外す）。送ってよいのは、それに入らず、アプリを終えるところでもないとき
 * 2. 圧縮前指示の作業が最後まで終わって、まだ圧縮していなければ（圧縮前指示から圧縮が終わるまでの間が残っていれば）、続けて圧縮する（次の指示を送ると、
 *    その初めに圧縮されて、指示が圧縮より上に出るため）。手で頼んだ前の指示の作業の中で自動の圧縮が済んでいれば、もう圧縮しない。止めた・失敗したときは圧縮しない
 * 3. AI が予約した作業場所の移動: 最後まで終わったら、いつもの続きより先に移す（済んだら settled）。止めた・失敗したら移さずに予約を消す
 * 4. 続き（afterTurn）: 続けての圧縮 → 預かった「いま」（送信待ちより先）→ 送信待ちの次（止めた・失敗したときも送る）
 */
export function onTurnEnded(s: ChatRunState, outcome: TurnOutcome, env: Env): Step {
  const ended = s.phase.kind === "turn" ? s.phase : null;
  const handoff = handoffAllows(env.handoff);
  const send = handoff && recoveryOnEnd(outcome) && !env.shuttingDown;
  const completed = send && outcome.status === "completed";
  const compactNext = completed && ended !== null && ended.turn !== "compact" && ended.compaction.awaiting;
  const manual = ended !== null && (ended.turn === "pre_compact" || ended.compaction.afterTurn);
  const then: AfterTurn = { compact: compactNext ? (manual ? "manual" : "auto") : null, send };
  const effects: Effect[] = [...(handoff ? [{ do: "end_recovery" as const, outcome }] : []), { do: "refresh_usage" }];
  const state: ChatRunState = { ...(handoff ? recoveryGateOnEnd(s, outcome) : s), phase: { kind: "idle" } };
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
