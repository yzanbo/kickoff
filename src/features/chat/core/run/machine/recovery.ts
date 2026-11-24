// 止まったあとの再開の決まり（純粋）: 通信の切断・使用枠の上限で止まったら送信待ちを門で止め、条件を待って再開する・聞く。起動したときの確かめに答える。
// 理由ごとに違うのは、待つ条件と知らせる文・聞く文・再開の文だけ（RECOVERY_RULES）。流れ（門を立てる・待つ・聞く・再開する・終わったら門を外す・自分で送ったらやめる）は 1 つ
import type { ReconnectState } from "@shared/chat/chatLive";
import { newMessage, setPaused } from "@shared/chat/outbox";
import { restartResumePrompt, USAGE_RESUME_PROMPT } from "@shared/chat/prompts";
import { pumpLater, startItem } from "./outbox";
import { isBusy } from "./state";
import type { ChatRunState, Effect, Env, RecoveryGate, RunEvent, TurnOutcome, WaitFor } from "./types";

export type { RecoveryGate };

/** 止まった理由（承認と同じ回答待ちの種類 ApprovalKind・ツール名にも、この名前を使う） */
export type RecoveryReason = RecoveryGate["reason"];

/** 自動で再開する回数の上限（続けてこの回数だけ通信で止まったら、人に聞く） */
export const MAX_AUTO_RESUMES = 3;

/** 枠が戻る時刻から、聞くまでに置く余裕（時刻ちょうどではまだ断られることがあるため） */
const MARGIN_MS = 60_000;

/** 理由ごとの、再開するかを聞くときの文（承認のカードと同じ回答待ち。Mac の通知も出る）と、再開の指示を送れなかったときのお知らせの頭 */
const RECOVERY_RULES: Record<RecoveryReason, { ask(gate: RecoveryGate): { title: string; description: string; input: Record<string, unknown> }; resumeFailed: string }> = {
  reconnect: {
    ask: ({ attempts }) => ({
      title: "自動で再開できませんでした",
      description: `通信が切れて止まったため、自動で ${attempts} 回再開しましたが、続けられませんでした。つながっているか確かめてから再開してください。`,
      input: { attempts },
    }),
    resumeFailed: "自動で再開できませんでした",
  },
  usage_limit: {
    ask: ({ holds }) => ({ title: "使用枠が戻りました", description: `使用枠の上限で止まっていた作業を、続きから再開しますか？${holds ? "止めておいた送信待ちは、再開した作業が終わってから送ります。" : ""}`, input: {} }),
    resumeFailed: "再開できませんでした",
  },
};

/** 再開の指示を送れなかったときの、お知らせの頭 */
export const resumeFailedOf = (reason: RecoveryReason): string => RECOVERY_RULES[reason].resumeFailed;

/** 使用枠の上限で止まった作業を続けるときの指示（通信の切断は、止まったサブエージェントを添える resumePrompt。殻が記録から作り直す） */
export const USAGE_RESUME = USAGE_RESUME_PROMPT;

/** お知らせに添える、止まったサブエージェントの文（「通信で止まったサブエージェント 2 件（調査、レビュー）」。なければ空） */
function agentsNote(agents: Record<string, string>): string {
  const names = Object.values(agents);
  return names.length > 0 ? `通信で止まったサブエージェント ${names.length} 件（${names.join("、")}）` : "";
}

/** 枠が戻る時刻の表示（11/4 15:00） */
function clockOf(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const withGate = (s: ChatRunState, gate: RecoveryGate | null): ChatRunState => ({ ...s, gates: { ...s.gates, recovery: gate } });
const notice = (effects: Effect[], message: string) => effects.push({ do: "record", kind: "notice", message });

/** 条件を待つ（つながる・時計がその時刻を過ぎる。満たしたら then） */
function waitFor(s: ChatRunState, gate: RecoveryGate, wait: WaitFor, then: "resume" | "ask", effects: Effect[]): ChatRunState {
  effects.push({ do: "watch", what: wait.kind });
  return withGate(s, { ...gate, step: { at: "wait", for: wait, then } });
}

/** 再開するかを聞く（その間に自分で再開していたら聞かない = 作業中・止まったままでない） */
function ask(s: ChatRunState, gate: RecoveryGate, env: Env, effects: Effect[]): ChatRunState {
  if (!env.chatFailed || isBusy(s)) return withGate(s, { ...gate, step: { at: "idle" } });
  effects.push({ do: "ask_recovery", reason: gate.reason, ...RECOVERY_RULES[gate.reason].ask(gate) });
  return withGate(s, { ...gate, step: { at: "asking" } });
}

/** 再開の指示を送る（止まったままでないとき・作業中なら送らない）。counted: 自動で再開した回数に数える */
function resume(s: ChatRunState, gate: RecoveryGate, env: Env, effects: Effect[], counted: boolean): ChatRunState {
  if (!env.chatFailed || isBusy(s)) return withGate(s, { ...gate, step: { at: "idle" } });
  const next = { ...gate, attempts: gate.attempts + (counted ? 1 : 0), step: { at: "resuming" as const } };
  effects.push({ do: "resume_recovery", reason: gate.reason, agents: Object.entries(gate.agents).map(([agentId, description]) => ({ agentId, description })) });
  return withGate(s, next);
}

/** 枠が戻る時刻が分かったら: その時刻（＋1 分）を過ぎてから聞く（分からなければ、お知らせだけ） */
function planUsage(s: ChatRunState, gate: RecoveryGate, resetAt: string | null, effects: Effect[]): ChatRunState {
  const held = gate.holds ? "送信待ちは止めてあります。" : "";
  if (!resetAt) {
    notice(effects, `使用枠の上限に達したため止まりました。枠が戻る時刻が分からないため、戻ったらメッセージを送ると続きから再開できます。${held}`);
    return withGate(s, { ...gate, step: { at: "idle" } });
  }
  notice(effects, `使用枠の上限に達したため止まりました。${clockOf(resetAt)} に枠が戻ったら、続けるかを確かめます。${held}`);
  return waitFor(s, gate, { kind: "clock", at: Date.parse(resetAt) + MARGIN_MS }, "ask", effects);
}

/** 門を外す（keepPaused: Kickoff が止めていた送信待ちを、利用者が止めたものにして止めたままにする。聞いていたら取り下げる） */
function release(s: ChatRunState, keepPaused: boolean, effects: Effect[]): ChatRunState {
  const gate = s.gates.recovery;
  if (!gate) return s;
  if (gate.step.at === "asking") effects.push({ do: "withdraw_ask" });
  return withGate({ ...s, outbox: gate.holds && keepPaused ? setPaused(s.outbox, true) : s.outbox }, null);
}

/**
 * 作業の終わりの段取り: 通信の切断・使用枠の上限で止まったら、送信待ちを門で止め（利用者が止めていたものはそのまま。paused は書かない =
 * 門は保存しないので、アプリを終えたら外れ、起動したときの確かめで聞く）、理由ごとの段取り（お知らせ・待つ・聞く）を始める（前の段取りは置き換え、
 * 止めた送信待ちと、通信の切断が続いている間の回数・止まったサブエージェントは引き継ぐ）。最後まで終わったら門を外して送る。止めた・ほかの理由で失敗したら、
 * 門を外して利用者が止めたものにする（自分で戻せる）
 */
export function recoveryOnEnd(s: ChatRunState, outcome: TurnOutcome, env: Env, effects: Effect[]): ChatRunState {
  const reason = outcome.network ? "reconnect" : outcome.usageLimit ? "usage_limit" : null;
  const prev = s.gates.recovery;
  if (!reason) return release(s, outcome.status !== "completed", effects);
  if (prev?.step.at === "asking") effects.push({ do: "withdraw_ask" });
  const carry = reason === "reconnect" && prev?.reason === "reconnect";
  const agents = { ...(carry ? prev.agents : {}), ...Object.fromEntries((outcome.stoppedAgents ?? []).map((a) => [a.agentId, a.description])) };
  const pausedByUser = s.outbox.paused;
  const gate: RecoveryGate = { reason, holds: (s.outbox.later.length > 0 && !pausedByUser) || (prev?.holds ?? false), attempts: carry ? prev.attempts : 0, agents, step: { at: "idle" } };
  if (reason === "usage_limit") {
    const reported = outcome.usageLimit?.resetsAt;
    if (reported) return planUsage(s, gate, reported, effects);
    effects.push({ do: "lookup_limit" });
    return withGate(s, { ...gate, step: { at: "lookup" } });
  }
  const note = agentsNote(agents);
  // 送信待ちを自分で止めていたら、自動では何も送らない（移動の前などに止めている）
  if (pausedByUser || !env.autoResumeOnReconnect) {
    notice(effects, `通信が切れたため止まりました。つながってからメッセージを送ると、続きから再開できます。${note ? `${note}は、サブエージェントの一覧の「再開」で続きから再開できます。` : ""}`);
    return withGate(s, gate);
  }
  // 何度再開しても続かない: 再開するかを人に聞く
  if (gate.attempts >= MAX_AUTO_RESUMES) return ask(s, gate, env, effects);
  notice(
    effects,
    (gate.attempts === 0 ? "通信が切れたため止まりました。つながったら自動で再開します。" : `自動で再開しましたが、また通信が切れました。つながったら再開します（${gate.attempts}/${MAX_AUTO_RESUMES} 回）。`) +
      (note ? `${note}も、続きから再開するよう頼みます。` : ""),
  );
  return waitFor(s, gate, { kind: "online" }, "resume", effects);
}

/** 再開の段取りの出来事（つながった・時計・枠の戻る時刻が分かった・答えた・自動で再開しない・自分で送った・再開の指示を送り終えた・起動したときの確かめ） */
export function recoveryStep(s: ChatRunState, e: Extract<RunEvent, { type: RecoveryEventType }>, env: Env, effects: Effect[]): ChatRunState {
  const gate = s.gates.recovery;
  const step = gate?.step;
  switch (e.type) {
    case "online":
      return gate && step?.at === "wait" && step.for.kind === "online" ? (step.then === "ask" ? ask(s, gate, env, effects) : resume(s, gate, env, effects, true)) : s;
    case "clock":
      return gate && step?.at === "wait" && step.for.kind === "clock" && e.now >= step.for.at ? (step.then === "ask" ? ask(s, gate, env, effects) : resume(s, gate, env, effects, true)) : s;
    case "limit_found":
      return gate && step?.at === "lookup" ? planUsage(s, gate, e.at, effects) : s;
    case "answer_recovery":
      // 再開する: 数え直して、すぐ送る（また止まったら、決まりの段取りから）。やめる: 送信待ちは止めたまま（利用者が止めたものにする）
      if (!gate || step?.at !== "asking") return s;
      return e.allow ? resume(s, { ...gate, attempts: 0 }, env, effects, false) : withGate({ ...s, outbox: gate.holds ? setPaused(s.outbox, true) : s.outbox }, null);
    case "stop_reconnect":
      if (!gate || step?.at !== "wait" || step.for.kind !== "online") return void effects.push({ do: "reject", status: 409, message: "つながるのを待っていません" }), s;
      return withGate(s, { ...gate, step: { at: "idle" } });
    case "forget_recovery":
      // 自分で送った・消去した・移した: 待つのも聞くのもやめる（再開の指示を送っているところなら何もしない）
      return step?.at === "resuming" ? s : release(s, true, effects);
    case "recovery_resumed":
      return gate && step?.at === "resuming" ? withGate(s, { ...gate, step: { at: "idle" } }) : s;
    case "forget_interrupted":
      return forgetInterrupted(s, effects);
    case "answer_restart":
      return answerRestart(s, e, env, effects);
  }
}

/** 再開の段取りの出来事の種類 */
export type RecoveryEventType = "online" | "clock" | "limit_found" | "answer_recovery" | "stop_reconnect" | "forget_recovery" | "recovery_resumed" | "forget_interrupted" | "answer_restart";

/** 自分で送った: 前回の終了で止まった作業を続けるかは、もう聞かない（印も外す）。送信待ちを聞いていれば、それは聞き続ける */
function forgetInterrupted(s: ChatRunState, effects: Effect[]): ChatRunState {
  const resume = s.gates.restart;
  if (!resume?.interrupted) return s;
  effects.push({ do: "resume_pending", value: false });
  return { ...s, gates: { ...s.gates, restart: resume.queued ? { interrupted: false, queued: true } : null } };
}

/**
 * 起動したときの再開の確かめに答える（印を外し、次の起動でも聞かない）。送る: 送信待ちだけを送る / 続ける: 中断した作業を続けるよう頼み（止まったサブエージェントの
 * 再開も）、送信待ちはその作業が終わってから送る（中断していなければ、送ると同じ）/ 止めておく: 送信待ちは止めておく。自分で送って作業中なら、続けるは頼まない
 */
function answerRestart(s: ChatRunState, e: Extract<RunEvent, { type: "answer_restart" }>, env: Env, effects: Effect[]): ChatRunState {
  const resume = s.gates.restart;
  if (!resume) return s;
  if (resume.interrupted) effects.push({ do: "resume_pending", value: false });
  s = { ...s, gates: { ...s.gates, restart: null } };
  if (e.action === "pause") return resume.queued ? { ...s, outbox: setPaused(s.outbox, true) } : s;
  if (isBusy(s)) return s;
  if (e.action === "continue" && resume.interrupted) {
    effects.push({ do: "reply", result: "sent", id: null });
    return startItem(s, newMessage(env, restartResumePrompt(e.agents), {}, []), "user", effects);
  }
  return resume.queued ? pumpLater(s, env, effects) : s;
}

/** 画面に出す、つながったら自動で再開するのを待っているところ（作業中の様子の reconnect。待っていなければ null） */
export function reconnectStateOf(gate: RecoveryGate | null): ReconnectState | null {
  if (gate?.step.at !== "wait" || gate.step.for.kind !== "online") return null;
  return { attempts: gate.attempts, max: MAX_AUTO_RESUMES, agents: Object.values(gate.agents) };
}
