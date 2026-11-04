import type { ApprovalCenter } from "../approvals.js";
import { errorMessage } from "@shared/errors";
import type { ChatQueue } from "../queue.js";
import type { TurnOutcome } from "../turn.js";
import type { Store } from "../../db/store.js";
import type { PlanUsage } from "@shared/types";
import { exhaustedResetOf } from "@shared/chat/usageLimit";

/** 枠が戻って、続けると答えたときに送る指示（自分の発言として残す） */
export const USAGE_RESUME_PROMPT = "（使用枠が戻ったので再開します）使用枠の上限で止まったところから、作業を続けてください。";

/** 枠が戻る時刻から、聞くまでに置く余裕（時刻ちょうどではまだ断られることがあるため） */
const MARGIN_MS = 60_000;

/** 枠が戻ったかを確かめる間隔（Mac がスリープしても遅れないよう、待つ時間ではなく時計の時刻で見る） */
const CHECK_MS = 60_000;

/** 枠が戻る時刻の表示（11/4 15:00） */
function clockOf(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * 使用枠の上限で止まったチャットの段取り（Runner から使う）:
 * 1. 止まったら、送信待ちを送らずに止めておく（送っても断られて消えるため）
 * 2. 枠が戻る時刻になったら、続けるかを聞く（承認のカードと同じ回答待ち。勝手には再開しない）
 * 3. 続けると答えたら「続けて」を送り、その作業が最後まで終わったら止めておいた送信待ちを戻す
 * 自分で送った・止めた・チャットを消したら、待つのも聞くのもやめる
 */
export class ChatUsageLimit {
  /** 枠が戻るのを待っているチャット（チャット → 聞く時刻） */
  private readonly waiting = new Map<number, number>();
  /** 続けるかを聞いているチャット（取り下げるため） */
  private readonly asks = new Map<number, AbortController>();
  /** 続けると答えて送っている途中（自分で送ったときと見分ける） */
  private readonly resuming = new Set<number>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly deps: {
      store: Store;
      approvals: ApprovalCenter;
      /** チャットの送信待ちの列 */
      queueOf: (chatId: number) => ChatQueue;
      /** 止まったときに、こちらで止めた送信待ち（再開して終わったら戻す。通信の切断の段取りと 1 つを使う） */
      heldQueues: Set<number>;
      isBusy: (chatId: number) => boolean;
      send: (chatId: number, text: string) => Promise<unknown>;
      /** 枠の使い方（Claude Code が戻る時刻を知らせなかったときに使う） */
      usage?: { get(): Promise<PlanUsage> };
      /** いまの時刻と確かめる間隔（テストで差し替える） */
      now?: () => number;
      checkMs?: number;
    },
  ) {}

  /** 作業が終わったとき。送信待ちを送ってよいかを返す（上限で止まったときは送らない） */
  finished(chatId: number, outcome: TurnOutcome): boolean {
    if (outcome.usageLimit) {
      void this.onLimit(chatId, outcome.usageLimit.resetsAt);
      return false;
    }
    // 通信の切断で止まったときは、止めた送信待ちを通信の段取りが引き継ぐ（ここで忘れると、戻す者がいなくなる）
    if (outcome.network) return true;
    // 最後まで終わった: 止めておいた送信待ちを戻す。止めた・ほかの理由で失敗した: 止めたまま（自分で戻せる）
    if (this.deps.heldQueues.delete(chatId) && outcome.status === "completed") this.deps.queueOf(chatId).setPaused(false);
    return true;
  }

  /** 続けると答えて送っている途中か（そこから届いた送信は、自分で送ったものとして扱わない） */
  isResuming(chatId: number): boolean {
    return this.resuming.has(chatId);
  }

  /** 自分でメッセージを送った・止めた・チャットを消した: 待つのも聞くのもやめる */
  forget(chatId: number) {
    if (this.resuming.has(chatId)) return;
    this.waiting.delete(chatId);
    this.deps.heldQueues.delete(chatId);
    this.asks.get(chatId)?.abort();
    this.stopTimerIfIdle();
  }

  shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async onLimit(chatId: number, reportedReset: string | null) {
    const { store } = this.deps;
    const queue = this.deps.queueOf(chatId);
    if (!store.chats.get(chatId)) return;
    // 送信待ちは送らずに止めておく（自分で止めていたものはそのまま。通信の段取りが止めていたものは、そのまま引き継ぐ）
    if (queue.list().length > 0 && !queue.isPaused()) {
      queue.setPaused(true);
      this.deps.heldQueues.add(chatId);
    }
    const resetAt = reportedReset ?? (await this.resetFromUsage());
    const held = this.deps.heldQueues.has(chatId) ? "送信待ちは止めてあります。" : "";
    if (!resetAt) {
      store.events.add(chatId, {
        type: "notice",
        message: `使用枠の上限に達したため止まりました。枠が戻る時刻が分からないため、戻ったらメッセージを送ると続きから再開できます。${held}`,
      });
      return;
    }
    store.events.add(chatId, {
      type: "notice",
      message: `使用枠の上限に達したため止まりました。${clockOf(resetAt)} に枠が戻ったら、続けるかを確かめます。${held}`,
    });
    this.waiting.set(chatId, Date.parse(resetAt) + MARGIN_MS);
    this.timer ??= setInterval(() => this.check(), this.deps.checkMs ?? CHECK_MS);
    this.check();
  }

  /** Claude Code が戻る時刻を知らせなかったとき: 使い切った枠の戻る時刻（分からなければ null） */
  private async resetFromUsage(): Promise<string | null> {
    try {
      return this.deps.usage ? exhaustedResetOf(await this.deps.usage.get()) : null;
    } catch {
      return null;
    }
  }

  /** 枠が戻る時刻を過ぎたチャットに、続けるかを聞く */
  private check() {
    const now = (this.deps.now ?? Date.now)();
    for (const [chatId, due] of this.waiting) {
      if (now < due) continue;
      this.waiting.delete(chatId);
      this.ask(chatId);
    }
    this.stopTimerIfIdle();
  }

  /** 続けるかを聞く（承認のカードと同じ回答待ち。Mac の通知も出る）。その間に自分で再開していたら聞かない */
  private ask(chatId: number) {
    const { store, approvals, isBusy } = this.deps;
    const chat = store.chats.get(chatId);
    if (!chat || chat.status !== "failed" || isBusy(chatId) || this.asks.has(chatId)) return;
    const controller = new AbortController();
    this.asks.set(chatId, controller);
    const { decision } = approvals.request(
      { chatId, projectId: chat.project_id },
      {
        kind: "usage_limit",
        toolName: "usage_limit",
        input: {},
        title: "使用枠が戻りました",
        description: `使用枠の上限で止まっていた作業を、続きから再開しますか？${this.deps.heldQueues.has(chatId) ? "止めておいた送信待ちは、再開した作業が終わってから送ります。" : ""}`,
        canRemember: false,
      },
      controller.signal,
    );
    void decision.then((answer) => {
      this.asks.delete(chatId);
      if (answer.action === "allow" && !controller.signal.aborted) void this.resume(chatId);
      // やめる: 送信待ちは止めたまま（自分で戻す・メッセージを送ると続きから再開できる）
      else this.deps.heldQueues.delete(chatId);
    });
  }

  private async resume(chatId: number) {
    const { store, isBusy, send } = this.deps;
    if (isBusy(chatId)) return;
    this.resuming.add(chatId);
    try {
      await send(chatId, USAGE_RESUME_PROMPT);
    } catch (e) {
      store.events.add(chatId, { type: "error", message: `再開できませんでした: ${errorMessage(e)}` });
    } finally {
      this.resuming.delete(chatId);
    }
  }

  private stopTimerIfIdle() {
    if (this.waiting.size === 0) this.shutdown();
  }
}
