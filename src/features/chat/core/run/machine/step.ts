// チャットの実行の状態機械（純粋）: 出来事を 1 件受けて、次の状態と命令（殻の Runner が実行する）を返す。
// 利用者・API の出来事は requests.ts、作業の終わりは turnEnd.ts、出す箱から次に出すものは outbox.ts
import { newMessage, pauseAtHead, placeContinuation, setPaused } from "@shared/chat/outbox";
import { recoveryStep } from "./recovery";
import { deliverNow, pumpLater, pumpNow } from "./outbox";
import { clearOf, compactOf, editingOf, preCompactToldOf, queueOf, queueSendOf, sendOf } from "./requests";
import { compactionAtStart, compactPhase } from "./state";
import { afterTurn, onTurnEnded } from "./turnEnd";
import type { ChatRunState, Effect, Env, RunEvent, Step, TurnPhase } from "./types";

/**
 * 出来事を 1 件受けて、次の状態と命令を返す。断るとき（命令 reject）は状態を変えない。
 * どの出来事のあとも、預かりの頭をいまの作業に足せるなら足す（pumpNow）。足している途中の行が足せなくなったら（圧縮が始まった・口がなくなった）その結果を待たない
 */
export function step(s: ChatRunState, event: RunEvent, env: Env): Step {
  const effects: Effect[] = [];
  const next = apply(s, event, env, effects);
  const rejected = effects.find((e) => e.do === "reject");
  if (rejected) return { state: s, effects: [rejected] };
  return { state: normalize(pumpNow(normalize(next), effects)), effects };
}

function apply(s: ChatRunState, e: RunEvent, env: Env, effects: Effect[]): ChatRunState {
  const p = s.phase;
  const turn = p.kind === "turn" ? p : null;
  const patchTurn = (patch: Partial<TurnPhase>): ChatRunState => (turn ? { ...s, phase: { ...turn, ...patch } } : s);
  switch (e.type) {
    case "send":
      return sendOf(s, e, env, effects);
    case "queue":
      return queueOf(s, e.command, env, effects);
    case "queue_send":
      return queueSendOf(s, e, env, effects);
    case "editing":
      return editingOf(s, e.lane, e.ids, env, effects);
    case "edit_hold_expired":
      return editingOf(s, e.lane, [], env, effects);
    case "compact":
      return compactOf(s, env, effects);
    case "pre_compact_told":
      return preCompactToldOf(s, e.ok, env);
    case "clear":
      return clearOf(s, env, effects, e.pump);
    case "cancel":
      // 作業中なら止める。親の会話を写している間（子チャット）は、写し終えたら動かさずに中断で終える（写すのは途中で止められない）
      if (turn) {
        effects.push({ do: "abort_turn" });
        return patchTurn({ stopRequested: true });
      }
      return p.kind === "preparing" && p.why === "inherit" ? { ...s, phase: { ...p, stopRequested: true } } : s;
    case "begin":
      return p.kind === "idle" ? { ...s, phase: { kind: "preparing", why: e.why, stopRequested: false } } : s;
    case "prepared": {
      if (p.kind !== "preparing") return s;
      const idle: ChatRunState = { ...s, phase: { kind: "idle" } };
      if (e.next === "send_next") return pumpLater(idle, env, effects);
      const head = idle.outbox.now[0];
      return e.next === "deliver" && head && !head.post_compact ? deliverNow(idle, effects) : idle;
    }
    case "turn_started": {
      // 送る準備の間（親の会話を写している間）に止めるよう頼んでいたら、動かし始めたらすぐ止める（プロバイダーを動かさずに中断で終える）
      const stop = p.kind === "preparing" && p.stopRequested;
      if (stop) effects.push({ do: "abort_turn" });
      const phase: TurnPhase = { kind: "turn", id: env.newId(), turn: e.turn, tell: e.turn === "compact" ? "never" : "opening", compaction: compactionAtStart(e.turn), stopRequested: stop, telling: null, compactBy: e.compactBy };
      return { ...s, phase, outbox: e.pauseAfter ? pauseAtHead(s.outbox) : s.outbox };
    }
    case "tell_ready":
      return turn && (turn.tell === "opening" || turn.tell === "open") ? patchTurn({ tell: e.ready ? "open" : "opening" }) : s;
    case "tell_result": {
      if (!turn || turn.telling !== e.id) return s;
      const item = s.outbox.now.find((m) => m.id === e.id);
      const now = e.ok || e.drop ? s.outbox.now.filter((m) => m.id !== e.id) : s.outbox.now;
      // 圧縮後指示を足したら、そのやり取りが終わるまで自分の指示は足さない。足せなければ、この作業の間のこのあとの「いま」も預かる（先に預かった指示より先に入らないように）
      const compaction = e.ok && item?.post_compact ? { ...turn.compaction, done: true } : turn.compaction;
      const tell = !e.ok && !e.drop && turn.tell === "open" ? "closed" : turn.tell;
      return { ...s, outbox: { ...s.outbox, now }, phase: { ...turn, telling: null, compaction, tell } };
    }
    case "compacting":
      // 始めた時刻は、終わるまで変えない。圧縮が始まったら、この作業が終わるまで「いま」を預かる（圧縮後指示のやり取りに混ぜない）
      return turn ? patchTurn({ compaction: { ...turn.compaction, running: e.active ? (turn.compaction.running ?? { since: e.at, trigger: e.trigger }) : null, ...(e.active ? { done: true } : {}) } }) : s;
    case "compacted": {
      // 圧縮後指示は、預かった指示の先頭に置く（圧縮が終わったら、それらより先に伝える）。手で圧縮する実行は、実行の終わりまで待つ間のまま
      const now = e.post ? [{ ...newMessage(env, e.post, {}, []), post_compact: true as const }, ...s.outbox.now] : s.outbox.now;
      const next: ChatRunState = { ...s, outbox: { ...s.outbox, now } };
      return turn ? { ...next, phase: { ...turn, compaction: { ...turn.compaction, done: true, ...(e.compactRun ? {} : { awaiting: false }) } } } : next;
    }
    case "pre_compact_injected":
      return turn ? patchTurn({ compaction: { ...turn.compaction, awaiting: true } }) : s;
    case "turn_ended": {
      const ended = onTurnEnded(s, e.outcome, env);
      effects.push(...ended.effects);
      return ended.state;
    }
    case "settled":
      return p.kind === "settling" ? afterTurn({ ...s, phase: { kind: "idle" } }, p.then, env, effects) : s;
    case "continuation": {
      const placed = placeContinuation(s.outbox, newMessage(env, e.text, {}, [], { workplace_continuation: true }), e.afterFinish);
      if (placed.stopped) effects.push({ do: "record", kind: "notice", message: "送信待ちを止めているので、AI が予約した続きの指示は送らずに送信待ちの先頭に入れました" });
      return { ...s, outbox: placed.box };
    }
    case "send_next":
      return pumpLater(s, env, effects);
    case "gates":
      return { ...s, gates: { ...s.gates, ...e.patch } };
    case "set_paused":
      return { ...s, outbox: setPaused(s.outbox, e.paused) };
    default:
      return recoveryStep(s, e, env, effects);
  }
}

/**
 * 状態をそろえる: 送信待ちが空になったら Kickoff が止めている印は外す。足している途中の行が、もう足せない（頭でなくなった・書き直し中・圧縮が始まった・
 * 圧縮したやり取りの途中の自分の指示・口がなくなった）なら結果を待たない（殻は足さずにやめ、行は預かりに残る）
 */
function normalize(s: ChatRunState): ChatRunState {
  const gate = s.gates.recovery;
  if (gate?.holds && s.outbox.later.length === 0) s = { ...s, gates: { ...s.gates, recovery: { ...gate, holds: false } } };
  const p = s.phase;
  if (p.kind !== "turn" || p.telling === null) return s;
  const head = s.outbox.now[0];
  const tellable = head?.id === p.telling && !s.editing.now.includes(head.id) && !compactPhase(p.compaction) && !(p.compaction.done && !head.post_compact) && p.tell === "open";
  return tellable ? s : { ...s, phase: { ...p, telling: null } };
}
