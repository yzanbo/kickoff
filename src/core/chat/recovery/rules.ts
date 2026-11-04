import type { Store } from "../../db/store.js";
import type { StoppedAgent, TurnOutcome } from "../turn.js";
import { networkStoppedSubagents } from "@shared/chat/subagents";
import { exhaustedResetOf } from "@shared/chat/usageLimit";
import { resumePrompt, USAGE_RESUME_PROMPT } from "@shared/chat/prompts";
import type { PlanUsage } from "@shared/types";
import type { RecoveryState } from "./state.js";

/** 止まった理由（承認と同じ回答待ちの種類 ApprovalKind・ツール名にも、この名前を使う） */
export type RecoveryReason = "reconnect" | "usage_limit";

/** 待つ条件: つながる（AI の API に届く）・時計がその時刻（ミリ秒）を過ぎる */
export type WaitFor = { kind: "online" } | { kind: "clock"; at: number };

/** 止まったときの段取り: 残すお知らせと、そのあと（お知らせだけ・すぐ聞く・条件を待ってから再開する / 聞く） */
export interface RecoveryPlan {
  notice?: string;
  next: { do: "none" } | { do: "ask" } | { do: "wait"; for: WaitFor; then: "resume" | "ask" };
}

/** 段取りを決めるときに渡すもの */
export interface RecoveryContext {
  chatId: number;
  state: RecoveryState;
}

/**
 * 止まった理由ごとの決まり。差し替えるのは、待つ条件と知らせる文・聞く文・再開の文だけで、流れ（送信待ちを止める・待つ・聞く・再開する・
 * 終わったら送信待ちを戻す・自分で送ったら忘れる）は recovery.ts の ChatRecovery が 1 つで持つ
 */
export interface RecoveryRule {
  reason: RecoveryReason;
  /** 止まったときの段取り（pausedByUser: 送信待ちを自分で止めていたか。こちらで止めたものは、どの理由で止めたものでも含めない） */
  plan(ctx: RecoveryContext & { pausedByUser: boolean; outcome: TurnOutcome }): RecoveryPlan | Promise<RecoveryPlan>;
  /** 再開するかを聞くときの文（承認のカードと同じ回答待ち。Mac の通知も出る） */
  ask(ctx: RecoveryContext): { title: string; description: string; input: Record<string, unknown> };
  /** 再開するときに送る指示（自分の発言として残す。文は @shared/chat/prompts） */
  prompt(ctx: RecoveryContext): string;
  /** 再開の指示を送れなかったときの、お知らせの頭 */
  resumeFailed: string;
}

// ---- 通信の切断 ----

/** 自動で再開する回数の上限（続けてこの回数だけ通信で止まったら、人に聞く） */
export const MAX_AUTO_RESUMES = 3;

/**
 * 通信が切れて止まったとき: つながったら「続けて」を送って自動で再開する（設定で切れる。送信待ちを自分で止めていれば再開しない）。
 * 続けて MAX_AUTO_RESUMES 回止まったら、再開するかを人に聞く
 */
export function reconnectRule({ store }: { store: Store }): RecoveryRule {
  return {
    reason: "reconnect",
    plan: ({ state, pausedByUser }) => {
      const agents = agentsNote(state);
      // 送信待ちを自分で止めていたら、自動では何も送らない（移動の前などに止めている）
      if (pausedByUser || !store.settings.get().auto_resume_on_reconnect) {
        return {
          notice: `通信が切れたため止まりました。つながってからメッセージを送ると、続きから再開できます。${agents ? `${agents}は、サブエージェントの一覧の「再開」で続きから再開できます。` : ""}`,
          next: { do: "none" },
        };
      }
      // 何度再開しても続かない: 再開するかを人に聞く
      if (state.attempts >= MAX_AUTO_RESUMES) return { next: { do: "ask" } };
      return {
        notice:
          (state.attempts === 0
            ? "通信が切れたため止まりました。つながったら自動で再開します。"
            : `自動で再開しましたが、また通信が切れました。つながったら再開します（${state.attempts}/${MAX_AUTO_RESUMES} 回）。`) +
          (agents ? `${agents}も、続きから再開するよう頼みます。` : ""),
        next: { do: "wait", for: { kind: "online" }, then: "resume" },
      };
    },
    ask: ({ state }) => ({
      title: "自動で再開できませんでした",
      description: `通信が切れて止まったため、自動で ${state.attempts} 回再開しましたが、続けられませんでした。つながっているか確かめてから再開してください。`,
      input: { attempts: state.attempts },
    }),
    prompt: ({ chatId, state }) => resumePrompt(agentsToResume(store, chatId, state)),
    resumeFailed: "自動で再開できませんでした",
  };
}

/**
 * 再開を頼むサブエージェント: 覚えたもののうち、いまも通信で止まったままのもの
 * （前の再開で戻ったものは除く。最後まで終わるまでは覚えておき、再開の途中でまた通信が切れても頼み直す）
 */
function agentsToResume(store: Store, chatId: number, state: RecoveryState): StoppedAgent[] {
  if (state.agents.size === 0) return [];
  const halted = new Set(networkStoppedSubagents(store.events.list(chatId), 0).map((s) => s.agentId));
  return [...state.agents].filter(([agentId]) => halted.has(agentId)).map(([agentId, description]) => ({ agentId, description }));
}

/** お知らせに添える、止まったサブエージェントの文（「通信で止まったサブエージェント 2 件（調査、レビュー）」。なければ空） */
function agentsNote(state: RecoveryState): string {
  const names = [...state.agents.values()];
  return names.length > 0 ? `通信で止まったサブエージェント ${names.length} 件（${names.join("、")}）` : "";
}

// ---- 使用枠の上限 ----

/** 枠が戻る時刻から、聞くまでに置く余裕（時刻ちょうどではまだ断られることがあるため） */
const MARGIN_MS = 60_000;

/**
 * 使用枠の上限で止まったとき: 枠が戻る時刻になったら、続けるかを聞く（勝手には再開しない）。
 * 戻る時刻は Claude Code が知らせたもの、なければ使い切った枠の戻る時刻（usage）。分からなければ、お知らせだけ
 */
export function usageLimitRule({ usage }: { usage?: { get(): Promise<PlanUsage> } }): RecoveryRule {
  /** Claude Code が戻る時刻を知らせなかったとき: 使い切った枠の戻る時刻（分からなければ null） */
  const resetFromUsage = async (): Promise<string | null> => {
    try {
      return usage ? exhaustedResetOf(await usage.get()) : null;
    } catch {
      return null;
    }
  };
  /** 枠が戻る時刻が分かったら: その時刻を過ぎてから聞く（分からなければ、お知らせだけ） */
  const planFor = (state: RecoveryState, resetAt: string | null): RecoveryPlan => {
    const held = state.held ? "送信待ちは止めてあります。" : "";
    if (!resetAt) {
      return { notice: `使用枠の上限に達したため止まりました。枠が戻る時刻が分からないため、戻ったらメッセージを送ると続きから再開できます。${held}`, next: { do: "none" } };
    }
    return {
      notice: `使用枠の上限に達したため止まりました。${clockOf(resetAt)} に枠が戻ったら、続けるかを確かめます。${held}`,
      next: { do: "wait", for: { kind: "clock", at: Date.parse(resetAt) + MARGIN_MS }, then: "ask" },
    };
  };
  return {
    reason: "usage_limit",
    plan: ({ state, outcome }) => {
      const reported = outcome.usageLimit?.resetsAt;
      return reported ? planFor(state, reported) : resetFromUsage().then((resetAt) => planFor(state, resetAt));
    },
    ask: ({ state }) => ({
      title: "使用枠が戻りました",
      description: `使用枠の上限で止まっていた作業を、続きから再開しますか？${state.held ? "止めておいた送信待ちは、再開した作業が終わってから送ります。" : ""}`,
      input: {},
    }),
    prompt: () => USAGE_RESUME_PROMPT,
    resumeFailed: "再開できませんでした",
  };
}

/** 枠が戻る時刻の表示（11/4 15:00） */
function clockOf(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
