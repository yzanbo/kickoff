import { randomUUID } from "node:crypto";
import type { HookCallbackMatcher } from "@anthropic-ai/claude-agent-sdk";
import { isPreCompactDone } from "@shared/chat/prompts";

/** 指示を足し始めるのに要る、コンテキストの残り（トークン。最後の応答のあとに届くツールの結果の分も見込む） */
const START_MARGIN = 30_000;
/** 指示の作業のために止め続ける間に残す、コンテキストの残り（これより減ったら圧縮を通す。Claude Code は返答の分も空けておく） */
const KEEP_MARGIN = 20_000;
/** 指示を足したあとに止める回数の上限（合図の一文が来なくても、ここで圧縮を通す） */
const MAX_HOLDS = 8;

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
  /** 足す発言の ID（テストで差し替える） */
  newId?: () => string;
}

/**
 * 上限に近づいて自動で圧縮する前に、圧縮前指示を足して済ませてもらう（Claude Code の PreCompact フックで圧縮を止める）。
 * Claude Code はツールの結果が返るたび（と指示を受けた直後）、送る前に自動の圧縮を決めてフックを呼ぶ。止めると圧縮せずに送る。
 * 1 回目に止めたときに指示を足し（足した発言は、その次の送信から AI が読む）、AI が合図の一文（PRE_COMPACT_DONE）を書くまで止め続ける。
 * 次のときは止めずに通す: 手で頼んだ圧縮・サブエージェントの圧縮・コンテキストの残りが少ない・止める回数の上限・
 * 前に止めてから応答が来ないまま呼ばれた（送ったら上限を超えた = あふれたときの圧縮。止めると先へ進めない）。
 * 圧縮したら（区切り）、次に上限に近づいたときにまた足す
 */
export function createPreCompactGate(opts: PreCompactGateOptions) {
  const newId = opts.newId ?? randomUUID;
  let phase: "ready" | "holding" | "passed" = "ready";
  let holds = 0;
  let tokens = opts.contextTokens;
  let repliedSinceHook = true;

  return {
    /** メインエージェントの応答（tokens: そのときのコンテキストの大きさ・text: 文の返答なら、その文） */
    noteReply(replyTokens: number, text: string | null) {
      repliedSinceHook = true;
      tokens = replyTokens;
      if (phase === "holding" && text !== null && isPreCompactDone(text)) phase = "passed";
    },
    /** 圧縮した（tokens: 要約したあとの大きさ。分からなければ null）。次に上限に近づいたら、また指示を足す */
    noteCompacted(postTokens: number | null) {
      phase = "ready";
      holds = 0;
      tokens = postTokens;
    },
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
