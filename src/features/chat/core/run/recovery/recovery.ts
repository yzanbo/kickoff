import type { ApprovalCenter } from "@/features/chat/core/approvals";
import { errorMessage } from "@shared/foundation/errors";
import type { Store } from "@/features/chat/core/stores";
import type { ChatRuns } from "@/features/chat/core/run/chatRuns";
import type { Effect, RunEvent, StoppedAgent, WaitFor } from "@/features/chat/core/run/machine/types";
import { resumeFailedOf, USAGE_RESUME, type RecoveryReason } from "@/features/chat/core/run/machine/recovery";
import { networkStoppedSubagents } from "@shared/chat/subagents";
import { resumePrompt } from "@shared/chat/prompts";
import { Poller } from "./poller";
import { canReachApi } from "./reachability";
import type { ProviderId } from "@shared/settings/types";
import type { Clock } from "@/foundation/core/clock";
import { PROVIDERS } from "@shared/ai/providers";

/** つながったかを確かめる間隔 */
const ONLINE_CHECK_MS = 15_000;

/** 枠が戻る時刻を過ぎたかを確かめる間隔（Mac がスリープしても遅れないよう、待つ時間ではなく時計の時刻で見る） */
const CLOCK_CHECK_MS = 60_000;

/** 再開の段取りの命令 */
export type RecoveryEffect = Extract<Effect, { do: "watch" | "ask_recovery" | "withdraw_ask" | "resume_recovery" | "lookup_limit" }>;

/**
 * 止まったあとの再開の段取りの殻（通信の切断・使用枠の上限で止まったとき）。決めるのは純粋な決まり（run/machine/recovery.ts）で、ここはその命令を実行する:
 * 条件の見張り（つながったか・時計。満たしたら online / clock を渡す）・再開するかを聞く（承認のカードと同じ回答待ち。答えは answer_recovery）・
 * 再開の指示を送る（送り終えたら recovery_resumed）・チャットの AI の使い切った枠の戻る時刻を調べる（limit_found）
 */
export class ChatRecovery {
  private readonly online: Poller;
  private readonly clock: Poller;
  private readonly now: () => number;
  /** 再開するかを聞いているカードの取り下げ（チャットごと） */
  private readonly asking = new Map<number, AbortController>();

  constructor(
    private readonly deps: {
      store: Store;
      approvals: ApprovalCenter;
      runs: ChatRuns;
      /** 見張りの時計（枠の戻りを見る時刻も、usageLimit.now を渡さなければこれ） */
      clock: Pick<Clock, "now" | "setTimeout" | "clearTimeout">;
      /** 出来事を渡す（殻の dispatch） */
      dispatch: (chatId: number, event: RunEvent) => void;
      send: (chatId: number, text: string) => Promise<unknown>;
      /** 枠の使い方（Claude Code が枠の戻る時刻を知らせなかったときに使う） */
      usage?: { limitResetAt(id: ProviderId): Promise<string | null> };
      /** つながったかの確かめ方（url: チャットの AI の確かめ先）と間隔（テストで差し替える） */
      reconnect?: { check?: (url: string) => Promise<boolean>; intervalMs?: number };
      /** 枠が戻ったかを確かめる時計と間隔（テストで差し替える） */
      usageLimit?: { now?: () => number; checkMs?: number };
    },
  ) {
    this.now = deps.usageLimit?.now ?? (() => deps.clock.now());
    const check = deps.reconnect?.check ?? canReachApi;
    this.online = new Poller({
      intervalMs: deps.reconnect?.intervalMs ?? ONLINE_CHECK_MS,
      clock: deps.clock,
      active: () => this.waiting("online").length > 0,
      tick: async () => {
        // チャットの AI ごとに、その AI の先に届くかを確かめる（確かめている間に待ち始めたチャットも、いまつながっているので一緒に再開する）
        for (const url of new Set(this.waiting("online").map((chatId) => this.reachabilityOf(chatId)))) {
          if (!(await check(url).catch(() => false))) continue;
          for (const chatId of this.waiting("online")) if (this.reachabilityOf(chatId) === url) deps.dispatch(chatId, { type: "online" });
        }
      },
    });
    this.clock = new Poller({ intervalMs: deps.usageLimit?.checkMs ?? CLOCK_CHECK_MS, clock: deps.clock, active: () => this.waiting("clock").length > 0, tick: () => this.checkClock() });
  }

  /** 命令を実行する */
  run(chatId: number, effect: RecoveryEffect) {
    if (effect.do === "watch") {
      // 時刻を待つなら、もう過ぎていないかをすぐ確かめる
      if (effect.what === "clock") this.checkClock();
      (effect.what === "online" ? this.online : this.clock).start();
    } else if (effect.do === "ask_recovery") this.ask(chatId, effect);
    else if (effect.do === "withdraw_ask") {
      const controller = this.asking.get(chatId);
      this.asking.delete(chatId);
      controller?.abort();
    } else if (effect.do === "resume_recovery") {
      // 送るのは出来事を回し終えてから（送る口は dispatch を呼ぶので、回している間に呼ぶと入れ子になる）
      void Promise.resolve().then(() => this.resume(chatId, effect.reason, effect.agents));
    } else void this.lookup(chatId);
  }

  /** 通信の切断で止まり、つながったら自動で再開するのを待っているチャット（アプリを終えるとき、起動したときの再開の確かめの印を付ける） */
  waitingForReconnect(): number[] {
    return this.waiting("online");
  }

  /** アプリを終えるとき（もう待たない） */
  shutdown() {
    this.online.stop();
    this.clock.stop();
  }

  /** 再開するかを聞く（取り下げた・また止まったなら、答えは捨てる） */
  private ask(chatId: number, { reason, title, description, input }: Extract<RecoveryEffect, { do: "ask_recovery" }>) {
    const chat = this.deps.store.chats.get(chatId);
    if (!chat) return;
    const controller = new AbortController();
    this.asking.set(chatId, controller);
    const { decision } = this.deps.approvals.request({ chatId, projectId: chat.project_id }, { kind: reason, toolName: reason, input, title, description, canRemember: false }, controller.signal);
    void decision.then((answer) => {
      if (this.asking.get(chatId) !== controller) return;
      this.asking.delete(chatId);
      this.deps.dispatch(chatId, { type: "answer_recovery", allow: answer.action === "allow" });
    });
  }

  /** 再開の指示を送る（通信の切断なら、覚えたサブエージェントのうち、いまも通信で止まったままのものの再開も頼む） */
  private async resume(chatId: number, reason: RecoveryReason, agents: StoppedAgent[]) {
    try {
      await this.deps.send(chatId, reason === "usage_limit" ? USAGE_RESUME : resumePrompt(this.halted(chatId, agents)));
    } catch (e) {
      this.deps.store.events.add(chatId, { type: "error", message: `${resumeFailedOf(reason)}: ${errorMessage(e)}` });
    } finally {
      this.deps.dispatch(chatId, { type: "recovery_resumed" });
    }
  }

  /** 再開を頼むサブエージェント: 覚えたもののうち、いまも通信で止まったままのもの（前の再開で戻ったものは除く） */
  private halted(chatId: number, agents: StoppedAgent[]): StoppedAgent[] {
    if (agents.length === 0) return [];
    const halted = new Set(networkStoppedSubagents(this.deps.store.events.forSubagents(chatId), 0).map((s) => s.agentId));
    return agents.filter((a) => halted.has(a.agentId));
  }

  /** AI が戻る時刻を知らせなかったとき: そのチャットの AI の使い切った枠の戻る時刻（分からなければ null） */
  private async lookup(chatId: number) {
    const provider = this.deps.store.chats.get(chatId)?.provider;
    const at = this.deps.usage && provider ? await this.deps.usage.limitResetAt(provider) : null;
    this.deps.dispatch(chatId, { type: "limit_found", at });
  }

  /** 枠が戻る時刻を待っているチャットに、いまの時刻を渡す（過ぎていれば決まりのとおりに進む） */
  private checkClock() {
    const waiting = this.waiting("clock");
    if (waiting.length === 0) return;
    const now = this.now();
    for (const chatId of waiting) this.deps.dispatch(chatId, { type: "clock", now });
  }

  /** チャットの AI の、つながったかを確かめる先 */
  private reachabilityOf(chatId: number): string {
    return PROVIDERS[this.deps.store.chats.get(chatId)?.provider ?? "claude"].reachability;
  }

  /** その条件を待っているチャット */
  private waiting(kind: WaitFor["kind"]): number[] {
    return this.deps.runs
      .all()
      .filter((r) => {
        const step = r.run.gates.recovery?.step;
        return step?.at === "wait" && step.for.kind === kind;
      })
      .map((r) => r.chatId);
  }
}
