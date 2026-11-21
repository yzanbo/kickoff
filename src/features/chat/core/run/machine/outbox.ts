// 出す箱から次に出すものを決める（純粋）: 預かりの頭をいまの作業に足す・作業の終わりに預かりの頭を送る・送信待ちの頭を送る・送れない終わり方なら置いておく。
// 行の出し入れそのものは @shared/chat/outbox
import { addLater, moveOne, newMessage, resetOptions, takeNext, type Outbox, type OutboxEnv } from "@shared/chat/outbox";
import { marksOf } from "@shared/chat/handoff";
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { QueuedMessage } from "@shared/chat/types";
import { compactPhase, handoffAllows, isBusy, queuePaused, waitingEdit } from "./state";
import type { ChatRunState, Effect, Env } from "./types";

/** まだ会話がないので行えないとき */
export const NO_SESSION = {
  compact: "まだ会話がないので、圧縮できません",
  clear: "まだ会話がないので、消去するコンテキストがありません",
} as const;

/**
 * 作業が送れない終わり方（通信の切断・使用枠の上限・アプリの終了）をしたときに、預かりを置いておく: 自分の指示は送信待ちの頭へ
 * （前からの送信待ちより先・送った順・印も。新しい行として足す）。圧縮後指示は送信待ちに入れずに預かりに残し、次に送った作業にそのまま伝える
 */
export function parkNow(box: Outbox, env: OutboxEnv): Outbox {
  let next: Outbox = { ...box, now: box.now.filter((m) => m.post_compact) };
  box.now
    .filter((m) => !m.post_compact)
    .forEach((m, i) => {
      const item = newMessage(env, m.text, m.options, m.attachments, marksOf(m));
      const added = addLater(next, item);
      next = moveOne(added, item.id, i) ?? added;
    });
  return next;
}

/** 引き継ぎで選択を戻す行の選択を戻す（AI を切り替えた記録の queued_ids） */
export function resetHandoffQueue(s: ChatRunState, env: Env): ChatRunState {
  if (env.handoff === null || env.handoffQueued.length === 0) return s;
  const outbox = resetOptions(s.outbox, env.handoffQueued);
  return outbox === s.outbox ? s : { ...s, outbox };
}

/** 指示を新しい作業として動かす（送る準備に入る。圧縮後指示なら圧縮後指示の作業） */
export function startItem(s: ChatRunState, item: QueuedMessage, from: "user" | "queue" | "held", effects: Effect[], pauseAfter = false): ChatRunState {
  effects.push({ do: "start_turn", turn: item.post_compact ? "post_compact" : "message", item, from, ...(pauseAfter ? { pauseAfter } : {}) });
  return { ...s, phase: { kind: "preparing", why: "send", stopRequested: false } };
}

/** 圧縮を動かす（作業していないとき。圧縮前指示があれば、先にその指示を 1 回の作業として送り、最後まで終わってから圧縮する） */
export function startCompact(s: ChatRunState, env: Env, trigger: CompactTrigger | null, effects: Effect[]): ChatRunState {
  if (trigger === null && env.preCompact) effects.push({ do: "start_turn", turn: "pre_compact", item: null, text: env.preCompact, from: "user" });
  else effects.push({ do: "start_turn", turn: "compact", item: null, trigger: trigger ?? "manual", from: "user" });
  return { ...s, phase: { kind: "preparing", why: "send", stopRequested: false } };
}

/**
 * 預かりの頭を、いまの作業に足す（足している途中の行があれば、その結果を待つ）。書き直している行・圧縮中と圧縮前指示から圧縮が終わるまで・
 * 圧縮したやり取りの途中の自分の指示（圧縮後指示だけは足す）・口がまだか閉じたときは待つ（作業の終わりに新しい作業として送る）
 */
export function pumpNow(s: ChatRunState, effects: Effect[]): ChatRunState {
  const p = s.phase;
  const head = s.outbox.now[0];
  if (p.kind !== "turn" || p.telling !== null || !head || s.editing.now.includes(head.id)) return s;
  if (compactPhase(p.compaction) || (p.compaction.done && !head.post_compact) || p.tell !== "open") return s;
  effects.push({ do: "tell", turnId: p.id, item: head });
  return { ...s, phase: { ...p, telling: head.id } };
}

/**
 * 作業していないときに、預かりの頭を新しい作業として送る（送信待ちより先。止めていても・線があっても）。残りはその作業に足す。
 * 頭を書き直している間は送らない（書き直しが終わったら送る）
 */
export function deliverNow(s: ChatRunState, effects: Effect[]): ChatRunState {
  const head = s.outbox.now[0];
  if (!head || isBusy(s) || s.editing.now.includes(head.id)) return s;
  return startItem({ ...s, outbox: { ...s.outbox, now: s.outbox.now.slice(1) } }, head, "held", effects);
}

/**
 * 送信待ちの頭を送る（作業の終わり・自動で送るに戻した・線や書き直しが外れたとき）。作業中・引き継ぎを確かめるまで・起動したときの確かめで送信待ちを
 * 聞いている間・書き直しを待つ間・止めている・先頭の上に線があるときは送らない（列が空なら、すべて送ったあとの線も外す）。
 * 圧縮の行は圧縮し（始められなければ理由を残して次へ）、消去の行はその場で消して次へ（会話がなければそのまま次へ）
 */
export function pumpLater(s: ChatRunState, env: Env, effects: Effect[]): ChatRunState {
  let session = env.hasSession;
  for (;;) {
    if (isBusy(s) || !handoffAllows(env.handoff)) return s;
    s = resetHandoffQueue(s, env);
    if (s.gates.restart?.queued) {
      if (s.outbox.later.length > 0) return s;
      s = answerRestartQueue(s);
    }
    const head = s.outbox.later[0];
    if ((head && !handoffAllows(env.handoff, head)) || waitingEdit(s) || queuePaused(s)) return s;
    const taken = takeNext(s.outbox);
    s = taken.box === s.outbox ? s : { ...s, outbox: taken.box };
    const next = taken.item;
    if (!next) return s;
    if (next.compact) {
      if (session) return startCompact(s, env, null, effects);
      effects.push({ do: "record", kind: "error", message: `送信待ちの会話の圧縮を始められませんでした: ${NO_SESSION.compact}` });
      continue;
    }
    if (next.clear) {
      if (session) effects.push({ do: "clear_session" });
      session = false;
      continue;
    }
    return startItem(s, next, "queue", effects);
  }
}

/** 起動したときの再開の確かめのうち、送信待ちを聞くのをやめる（送信待ちを自分で動かした・空になった。作業の途中で止まったことは聞き続ける） */
export function answerRestartQueue(s: ChatRunState): ChatRunState {
  const resume = s.gates.restart;
  if (!resume) return s;
  return { ...s, gates: { ...s.gates, restart: resume.interrupted ? { interrupted: true, queued: false } : null } };
}
