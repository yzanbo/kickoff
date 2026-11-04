import type { ReconnectState } from "@shared/types";
import { MAX_AUTO_RESUMES, type RecoveryRule, type WaitFor } from "./rules.js";

/** 再開の条件を待っているところ（待つ条件と、満たしたあとに再開するか・聞くか） */
export interface RecoveryWait {
  rule: RecoveryRule;
  for: WaitFor;
  then: "resume" | "ask";
}

/**
 * 止まったあとの再開の段取りの、チャットごとの状態（ChatRuntime が持つ。保存しない。動かすのは recovery.ts の ChatRecovery）。
 * 止まった理由（通信の切断・使用枠の上限）に関係なく 1 つで持つので、続けて別の理由で止まっても、止めた送信待ちを引き継ぐ
 */
export interface RecoveryState {
  /** こちらで止めた送信待ち（再開した作業が最後まで終わったら戻す。自分で送ったら忘れる。止めたままになるので、自分で戻せる） */
  held: boolean;
  /** 続けて自動で再開した回数（通信の切断が続いている間だけ数える。MAX_AUTO_RESUMES 回で人に聞く） */
  attempts: number;
  /** 通信の切断で止まり、まだ再開を頼んでいないサブエージェント（作業 ID → 名前。通信の切断が続いている間だけ覚える） */
  agents: Map<string, string>;
  /** 再開の条件を待っているところ（待っていなければ null） */
  waiting: RecoveryWait | null;
  /** 再開するかを聞いているところ（取り下げるため。聞いていなければ null） */
  asking: AbortController | null;
  /** 再開の指示を送っている途中（その送信は、自分で送ったものとして扱わない） */
  resuming: boolean;
  /** 段取りを決め直した回数（決めている途中に、自分で送った・また止まったかを見分ける） */
  version: number;
}

export function createRecoveryState(): RecoveryState {
  return { held: false, attempts: 0, agents: new Map(), waiting: null, asking: null, resuming: false, version: 0 };
}

/** 画面に出す、つながったら自動で再開するのを待っているところ（作業中の様子の reconnect。待っていなければ null） */
export function reconnectStateOf(state: RecoveryState): ReconnectState | null {
  if (state.waiting?.for.kind !== "online") return null;
  return { attempts: state.attempts, max: MAX_AUTO_RESUMES, agents: [...state.agents.values()] };
}
