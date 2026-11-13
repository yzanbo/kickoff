import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BackgroundState } from "@shared/types";

/** すぐには閉じないとき（足した発言・裏の作業の終わりの知らせで、次の返答が始まりうる）に、始まるのを待つ時間 */
export const TURN_OVER_GRACE_MS = 2000;

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/**
 * Claude Code の入力を閉じる時を決める（閉じると、手が空いた Claude Code は終わり、実行が終わる）。
 * 閉じたあとは作業中の発言を足せない（Runner の「いま」が送信待ちに戻る）ので、Claude Code が本当に手が空いたときだけ閉じる。
 * 目印は Claude Code の session_state_changed（CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS。idle = 抱えた指示・裏のサブエージェントを
 * 済ませた区切り）で、idle になった時点で裏の作業（コマンドなど）がなければ閉じる。
 * 返答の終わり（result）だけでは閉じない: 返答の終わりの直前に届いた発言・裏の作業の終わりの知らせがあれば、Claude Code は
 * 次の返答を続ける（前は result と裏の作業 0 件で閉じていたので、その返答の間ずっと「いま」が届かなかった）。
 * すぐには閉じず grace だけ待つのは 2 つ: 前の running のあとに発言を足していた idle（Claude Code が発言を読む前に idle を出し、
 * 読んでから次の返答を始めることがある）と、idle の間に裏の作業が 0 件になったとき（Claude Code は 0 件を知らせてから、
 * 終わりの知らせへの返答を始める）。待つ間に返答を始めたら（running）やめて、その返答の idle を待つ。
 * session_state_changed を出さない古い Claude Code では、今までどおり返答の終わりと裏の作業 0 件で閉じる
 */
export function createTurnOver(close: () => void, { graceMs = TURN_OVER_GRACE_MS, timers = realTimers }: { graceMs?: number; timers?: Timers } = {}) {
  let sawState = false;
  let state: "idle" | "running" | "requires_action" = "running";
  let tasks = 0;
  // 前に running になってから発言を足したか（足した発言で次の返答が始まりうる）
  let pushedSinceRunning = false;
  let timer: unknown = null;
  const cancel = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const closeLater = () => {
    if (timer !== null) return;
    timer = timers.set(() => {
      timer = null;
      if (state === "idle" && tasks === 0) close();
    }, graceMs);
  };
  return {
    /** SDK のメッセージと、そのメッセージで変わった裏の作業の様子（変わらなければ undefined）を渡す */
    note(msg: SDKMessage, background: BackgroundState | undefined) {
      if (msg.type === "system" && msg.subtype === "session_state_changed") {
        sawState = true;
        state = msg.state;
        cancel();
        if (state === "running") pushedSinceRunning = false;
        if (state === "idle" && tasks === 0) {
          if (pushedSinceRunning) closeLater();
          else close();
        }
        return;
      }
      if (!background) return;
      tasks = background.tasks.length;
      if (!sawState) {
        if (background.replied && tasks === 0) close();
        return;
      }
      if (tasks > 0) cancel();
      else if (state === "idle") closeLater();
    },
    /** 発言を足した（作業中の発言・圧縮前指示） */
    pushed() {
      pushedSinceRunning = true;
    },
    /** 実行が終わった（待っている閉じるをやめる） */
    stop: cancel,
  };
}
