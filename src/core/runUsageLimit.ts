import type { ApprovalCenter } from "./approvals.js";
import { errorMessage } from "./errors.js";
import type { FollowupQueue } from "./followups.js";
import type { RunOutcome } from "./runExecution.js";
import type { Store } from "./store.js";
import type { PlanUsage } from "./types.js";
import { exhaustedResetOf } from "./usageLimit.js";

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
export class RunUsageLimit {
  /** 枠が戻るのを待っているチャット（チャット → 聞く時刻） */
  private readonly waiting = new Map<number, number>();
  /** 続けるかを聞いているチャット（取り下げるため） */
  private readonly asks = new Map<number, AbortController>();
  /** 上限で止まったときに、こちらで止めた送信待ち（再開して終わったら戻す） */
  private readonly heldQueues = new Set<number>();
  /** 続けると答えて送っている途中（自分で送ったときと見分ける） */
  private readonly resuming = new Set<number>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly deps: {
      store: Store;
      approvals: ApprovalCenter;
      followups: FollowupQueue;
      isBusy: (runId: number) => boolean;
      send: (runId: number, text: string) => Promise<unknown>;
      /** 枠の使い方（Claude Code が戻る時刻を知らせなかったときに使う） */
      usage?: { get(): Promise<PlanUsage> };
      /** いまの時刻と確かめる間隔（テストで差し替える） */
      now?: () => number;
      checkMs?: number;
    },
  ) {}

  /** 作業が終わったとき。送信待ちを送ってよいかを返す（上限で止まったときは送らない） */
  finished(runId: number, outcome: RunOutcome): boolean {
    if (outcome.usageLimit) {
      void this.onLimit(runId, outcome.usageLimit.resetsAt);
      return false;
    }
    // 最後まで終わった: 止めておいた送信待ちを戻す。止めた・ほかの理由で失敗した: 止めたまま（自分で戻せる）
    if (this.heldQueues.delete(runId) && outcome.status === "completed") this.deps.followups.setPaused(runId, false);
    return true;
  }

  /** 自分でメッセージを送った・止めた・チャットを消した: 待つのも聞くのもやめる */
  forget(runId: number) {
    if (this.resuming.has(runId)) return;
    this.waiting.delete(runId);
    this.heldQueues.delete(runId);
    this.asks.get(runId)?.abort();
    this.stopTimerIfIdle();
  }

  shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async onLimit(runId: number, reportedReset: string | null) {
    const { store, followups } = this.deps;
    if (!store.getRun(runId)) return;
    // 送信待ちは送らずに止めておく（自分で止めていたものはそのまま）
    if (followups.list(runId).length > 0 && !followups.isPaused(runId)) {
      followups.setPaused(runId, true);
      this.heldQueues.add(runId);
    }
    const resetAt = reportedReset ?? (await this.resetFromUsage());
    const held = this.heldQueues.has(runId) ? "送信待ちは止めてあります。" : "";
    if (!resetAt) {
      store.addEvent(runId, {
        type: "notice",
        message: `使用枠の上限に達したため止まりました。枠が戻る時刻が分からないため、戻ったらメッセージを送ると続きから再開できます。${held}`,
      });
      return;
    }
    store.addEvent(runId, {
      type: "notice",
      message: `使用枠の上限に達したため止まりました。${clockOf(resetAt)} に枠が戻ったら、続けるかを確かめます。${held}`,
    });
    this.waiting.set(runId, Date.parse(resetAt) + MARGIN_MS);
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
    for (const [runId, due] of this.waiting) {
      if (now < due) continue;
      this.waiting.delete(runId);
      this.ask(runId);
    }
    this.stopTimerIfIdle();
  }

  /** 続けるかを聞く（承認のカードと同じ回答待ち。Mac の通知も出る）。その間に自分で再開していたら聞かない */
  private ask(runId: number) {
    const { store, approvals, isBusy } = this.deps;
    const run = store.getRun(runId);
    if (!run || run.status !== "failed" || isBusy(runId) || this.asks.has(runId)) return;
    const controller = new AbortController();
    this.asks.set(runId, controller);
    const { decision } = approvals.request(
      { runId, projectId: run.project_id },
      {
        kind: "usage_limit",
        toolName: "usage_limit",
        input: {},
        title: "使用枠が戻りました",
        description: `使用枠の上限で止まっていた作業を、続きから再開しますか？${this.heldQueues.has(runId) ? "止めておいた送信待ちは、再開した作業が終わってから送ります。" : ""}`,
        canRemember: false,
      },
      controller.signal,
    );
    void decision.then((answer) => {
      this.asks.delete(runId);
      if (answer.action === "allow" && !controller.signal.aborted) void this.resume(runId);
      // やめる: 送信待ちは止めたまま（自分で戻す・メッセージを送ると続きから再開できる）
      else this.heldQueues.delete(runId);
    });
  }

  private async resume(runId: number) {
    const { store, isBusy, send } = this.deps;
    if (isBusy(runId)) return;
    this.resuming.add(runId);
    try {
      await send(runId, USAGE_RESUME_PROMPT);
    } catch (e) {
      store.addEvent(runId, { type: "error", message: `再開できませんでした: ${errorMessage(e)}` });
    } finally {
      this.resuming.delete(runId);
    }
  }

  private stopTimerIfIdle() {
    if (this.waiting.size === 0) this.shutdown();
  }
}
