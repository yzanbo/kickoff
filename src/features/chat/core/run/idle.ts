// 「作業中でないと確かめる → 段階を準備にする → 用意 → 確かめ直す → 確定 → 失敗なら戻す」を 1 つの形にする
// （巻き戻し・AI の切り替え・引き継ぎのやり直し・作業場所の移動。段階を準備にするのはここだけ。新しいチャットと親の会話を写すのは preparations.ts）
import { Conflict } from "@/foundation/core/errors";
import { Undo } from "@/foundation/core/undo";
import type { PrepareReason } from "@shared/chat/chatLive";
import { queuePaused } from "@/features/chat/core/run/machine/state";
import type { ChatRun } from "./chatRun";
import type { RunShell } from "./shell";

/** 用意する関数に渡すもの */
export interface IdleChat {
  /** 自分の番のままか確かめる（段階が変わった・チャットを消した・watchQueue なら送信待ちの形が変わったら Conflict） */
  still(): void;
  /** 失敗したときに戻す手順（足した順の逆に流す） */
  undo: Undo;
  /** 準備を済ませて作業していないに戻す（続けてその場で送るとき。済ませたら終わりに何もしない） */
  release(): void;
}

export interface IdleChatOptions {
  /** 作業中なら 409 で断る（省けば断る。false = 呼ぶ側が確かめた、または作業の終わりにすることの中から呼ぶ） */
  check?: boolean;
  /** 用意している間に送信待ちの形が変わったら確定しない（AI の切り替え。失敗して形が変わっていれば、増えた指示を送らないよう送信待ちを止める） */
  watchQueue?: boolean;
  /** 確かめ直しで断るときの文（省けば「チャットの状態が変わったため、続けられません」） */
  conflict?: string;
  /** 済んだあとにすること（ok = 用意が成功した）。send_next = 送信待ちの次を送る / deliver = 預かり（なければ送信待ちの次）を送る */
  next?(ok: boolean): "send_next" | "deliver" | undefined;
}

/** 確かめ直しで比べる送信待ちの形 */
const queueSignature = (run: ChatRun) => JSON.stringify({ messages: run.outbox.later, paused: queuePaused(run.run), stops: run.outbox.stops });

/**
 * 作業中でないと確かめてから段階を準備（why）にして作業中に数え、fn で用意して確定する。fn が投げたら undo を流して投げ直す。
 * 終わったら（成功でも失敗でも）作業していないに戻し、next の答えで次を送る（準備の間に止めるよう頼まれていたら送らない）
 */
export async function withIdleChat<T>(shell: RunShell, chatId: number, why: PrepareReason, action: string, fn: (h: IdleChat) => Promise<T>, opts: IdleChatOptions = {}): Promise<T> {
  if (opts.check !== false) shell.requireIdle(chatId, action);
  const run = shell.runs.get(chatId);
  const signature = opts.watchQueue ? queueSignature(run) : null;
  const undo = new Undo(shell.deps.log ?? console);
  let released = false;
  let ok = false;
  shell.dispatch(chatId, { type: "begin", why });
  const h: IdleChat = {
    still() {
      const { phase } = run.run;
      const mine = !released && shell.runs.peek(chatId) === run && phase.kind === "preparing" && phase.why === why;
      if (!mine || (signature !== null && queueSignature(run) !== signature)) {
        throw new Conflict(opts.conflict ?? "チャットの状態が変わったため、続けられません");
      }
    },
    undo,
    release() {
      if (released) return;
      released = true;
      shell.dispatch(chatId, { type: "prepared" });
    },
  };
  try {
    const result = await fn(h);
    ok = true;
    return result;
  } catch (e) {
    await undo.run();
    throw e;
  } finally {
    if (!released) {
      const next = opts.next?.(ok);
      shell.dispatch(chatId, { type: "prepared", ...(next ? { next } : {}) });
      // 失敗したとき、準備の間に増えた指示を意図せず元のまま送らない
      if (!ok && signature !== null && queueSignature(run) !== signature && run.outbox.later.length > 0) shell.dispatch(chatId, { type: "set_paused", paused: true });
    }
  }
}
