import { randomUUID } from "node:crypto";
import type { HookCallbackMatcher } from "@anthropic-ai/claude-agent-sdk";
import { isPreCompactDone, PRE_COMPACT_NUDGE } from "@shared/chat/prompts";

/** 指示を足し始めるのに要る、コンテキストの残り（トークン。最後の応答のあとに届くツールの結果の分も見込む） */
const START_MARGIN = 30_000;
/** 指示の作業のために止め続ける間に残す、コンテキストの残り（これより減ったら圧縮を通す。Claude Code は返答の分も空けておく） */
const KEEP_MARGIN = 20_000;
/** 指示を足したあとに止める回数の上限（合図の一文が来なくても、ここで圧縮を通す） */
const MAX_HOLDS = 8;
/**
 * 合図のあと、裏の作業の終わりだけを待って止まってから、背中を押す発言を足すまでの時間。turnOver.ts の TURN_OVER_GRACE_MS（2 秒）より長くし、
 * 手が空いた直後に Claude Code が自分で次を始める（届いていた知らせ・足した発言を読む）ときは足さない
 */
export const PRE_COMPACT_NUDGE_MS = 5000;

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export interface PreCompactGateOptions {
  /** AI に足す文（前置き付きの圧縮前指示） */
  message: string;
  /** コンテキストウィンドウ */
  contextWindow: number;
  /** 実行を始めたときのコンテキストの大きさ（前の作業の終わりの値。分からなければ null） */
  contextTokens: number | null;
  /** 発言を足す（入力が閉じていれば false） */
  push(text: string, uuid: string): boolean;
  /** 足した（記録はコアが残す） */
  onSent(uuid: string): void;
  /** 合図のあとに止まったので、背中を押す発言（PRE_COMPACT_NUDGE）を足した（記録はコアが残す） */
  onNudged?(uuid: string): void;
  /** 足す発言の ID（テストで差し替える） */
  newId?: () => string;
  /** 背中を押すまでの時間と時計（テストで差し替える） */
  nudgeMs?: number;
  timers?: Timers;
}

/**
 * 上限に近づいて自動で圧縮する前に、圧縮前指示を足して済ませてもらう（Claude Code の PreCompact フックで圧縮を止める）。
 * Claude Code はツールの結果が返るたび（と指示を受けた直後）、送る前に自動の圧縮を決めてフックを呼ぶ。止めると圧縮せずに送る。
 * 1 回目に止めたときに指示を足し（足した発言は、その次の送信から AI が読む）、AI が合図の一文（PRE_COMPACT_DONE）を書くまで止め続ける。
 * 次のときは止めずに通す: 手で頼んだ圧縮・サブエージェントの圧縮・コンテキストの残りが少ない・止める回数の上限・
 * 前に止めてから応答が来ないまま呼ばれた（送ったら上限を超えた = あふれたときの圧縮。止めると先へ進めない）。
 * 圧縮したら（区切り）、次に上限に近づいたときにまた足す。
 * 合図を書いたあと、AI がツールを呼ばずに返答を終え、裏の作業（開発サーバー・監視など）の終わりだけを待って止まると、Claude Code は
 * 次を送らないので圧縮が始まらない（裏の作業が自分では終わらなければ、いつまでも）。そのまま `nudgeMs` たったら、背中を押す発言を 1 回足して送らせ、
 * 圧縮を走らせる（noteWaiting。圧縮したら、いつもどおりコアが圧縮後指示から続ける）
 */
export function createPreCompactGate(opts: PreCompactGateOptions) {
  const newId = opts.newId ?? randomUUID;
  const timers = opts.timers ?? realTimers;
  const nudgeMs = opts.nudgeMs ?? PRE_COMPACT_NUDGE_MS;
  let phase: "ready" | "holding" | "passed" = "ready";
  let holds = 0;
  let tokens = opts.contextTokens;
  let repliedSinceHook = true;
  // 合図の一文を受けて、まだ圧縮していないか（背中を押す相手）と、もう押したか（押すのは圧縮 1 回につき 1 回だけ）
  let signaled = false;
  let nudged = false;
  let timer: unknown = null;
  const cancel = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const nudge = () => {
    timer = null;
    if (!signaled || nudged) return;
    const uuid = newId();
    if (!opts.push(PRE_COMPACT_NUDGE, uuid)) return;
    nudged = true;
    opts.onNudged?.(uuid);
  };

  return {
    /** メインエージェントの応答（tokens: そのときのコンテキストの大きさ・text: 文の返答なら、その文） */
    noteReply(replyTokens: number, text: string | null) {
      repliedSinceHook = true;
      tokens = replyTokens;
      if (phase === "holding" && text !== null && isPreCompactDone(text)) {
        phase = "passed";
        signaled = true;
      }
    },
    /** 圧縮した（tokens: 要約したあとの大きさ。分からなければ null）。次に上限に近づいたら、また指示を足す */
    noteCompacted(postTokens: number | null) {
      phase = "ready";
      holds = 0;
      tokens = postTokens;
      signaled = false;
      nudged = false;
      cancel();
    },
    /**
     * Claude Code が手の空いたまま裏の作業の終わりだけを待っているか（turnOver.ts の waitingOnBackground。知らせが届くたびに渡す）。
     * 合図のあとにそうなったら、nudgeMs 続いたところで背中を押す発言を足す（その前に動き出した・裏の作業がなくなったらやめる）
     */
    noteWaiting(waiting: boolean) {
      if (!waiting || !signaled || nudged) return cancel();
      if (timer === null) timer = timers.set(nudge, nudgeMs);
    },
    /** 実行が終わった（待っている背中押しをやめる） */
    stop: cancel,
    /** 圧縮を止めるか（止めるなら true） */
    shouldBlock(trigger: "manual" | "auto", agentId: string | undefined): boolean {
      if (trigger !== "auto" || agentId) return false;
      const replied = repliedSinceHook;
      repliedSinceHook = false;
      if (phase === "passed") return false;
      const left = tokens === null ? 0 : opts.contextWindow - tokens;
      if (!replied || holds >= MAX_HOLDS || left < (phase === "ready" ? START_MARGIN : KEEP_MARGIN)) {
        phase = "passed";
        return false;
      }
      if (phase === "ready") {
        const uuid = newId();
        if (!opts.push(opts.message, uuid)) {
          phase = "passed";
          return false;
        }
        opts.onSent(uuid);
        phase = "holding";
      }
      holds += 1;
      return true;
    },
  };
}

export type PreCompactGate = ReturnType<typeof createPreCompactGate>;

/** 応答の中身のうち、文の部分（なければ null） */
export function replyText(content: readonly { type: string }[]): string | null {
  const texts = content.flatMap((block) => (block.type === "text" && "text" in block && typeof block.text === "string" ? [block.text] : []));
  return texts.length > 0 ? texts.join("\n") : null;
}

/** ゲートを Claude Code の PreCompact フックにする */
export function preCompactHook(gate: PreCompactGate): HookCallbackMatcher {
  return {
    hooks: [
      async (input) => {
        if (input.hook_event_name !== "PreCompact") return {};
        const agentId = "agent_id" in input && typeof input.agent_id === "string" ? input.agent_id : undefined;
        return gate.shouldBlock(input.trigger, agentId) ? { decision: "block", reason: "圧縮前指示を済ませてから圧縮します" } : {};
      },
    ],
  };
}
