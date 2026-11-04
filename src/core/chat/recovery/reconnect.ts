import type { ApprovalCenter } from "../approvals.js";
import type { Bus } from "../../bus.js";
import { errorMessage } from "@shared/errors";
import type { FollowupQueue } from "../queue.js";
import { canReachApi, ReconnectWatcher } from "./reachability.js";
import type { RunOutcome, StoppedAgent } from "../turn.js";
import type { Store } from "../../db/store.js";
import { networkStoppedSubagents } from "@shared/chat/subagents";
import type { ReconnectState } from "@shared/types";

/** 自動で再開する回数の上限（続けてこの回数だけ通信で止まったら、人に聞く） */
export const MAX_AUTO_RESUMES = 3;

/** 自動で再開するときに送る指示（自分の発言として残す） */
export const RESUME_PROMPT = "（通信が戻ったので自動で再開します）通信が切れて止まったところから、作業を続けてください。";

/**
 * 自動で再開するときの指示。通信の切断で止まったサブエージェントがあれば、SendMessage で続きから再開するよう頼む
 * （Claude Code はサブエージェントの記録から続きを始める。記録が見つからないときだけ、同じ依頼で立ち上げ直す）
 */
export function resumePrompt(agents: StoppedAgent[]): string {
  if (agents.length === 0) return RESUME_PROMPT;
  return [
    RESUME_PROMPT,
    "",
    "通信の切断で、次のサブエージェントも止まっています。それぞれ SendMessage（宛先は ID）で、止まったところから続けるよう伝えて再開させてください。再開できないもの（記録が見つからないなど）だけ、同じ依頼で立ち上げ直してください。",
    ...agents.map((a) => `- 「${a.description}」（ID: ${a.agentId}）`),
  ].join("\n");
}

/**
 * 通信が切れて止まったチャットの再開の段取り（Runner から使う）:
 * 1. 止まったら、送信待ちを送らずに止めておき（失敗して消えないように）、つながるのを待つ
 * 2. つながったら「続けて」を送って自動で再開する（設定で切れる。送信待ちを自分で止めていれば再開しない）
 * 3. 続けて MAX_AUTO_RESUMES 回止まったら、再開するかを人に聞く（承認のカードと同じ回答待ち）
 * 再開した作業が最後まで終わったら、止めておいた送信待ちを元に戻す
 */
export class RunReconnect {
  private readonly watcher: ReconnectWatcher;
  /** 続けて自動で再開した回数 */
  private readonly attempts = new Map<number, number>();
  /** 再開するかを聞いているチャット（取り下げるため） */
  private readonly asks = new Map<number, AbortController>();
  /** 通信で止まったときに、こちらで止めた送信待ち（再開して終わったら戻す） */
  private readonly heldQueues = new Set<number>();
  /** 自動で再開している途中（自分で送ったときと見分ける） */
  private readonly resuming = new Set<number>();
  /** 通信の切断で止まり、まだ再開を頼んでいないサブエージェント（作業 ID → 名前。続けて止まったら足していく） */
  private readonly stoppedAgents = new Map<number, Map<string, string>>();

  constructor(
    private readonly deps: {
      store: Store;
      approvals: ApprovalCenter;
      bus?: Bus;
      followups: FollowupQueue;
      isBusy: (runId: number) => boolean;
      send: (runId: number, text: string) => Promise<unknown>;
      /** AI の API に届くか（テストで差し替える） */
      check?: () => Promise<boolean>;
      /** つながったかを確かめる間隔 */
      intervalMs?: number;
    },
  ) {
    this.watcher = new ReconnectWatcher({
      check: deps.check ?? canReachApi,
      intervalMs: deps.intervalMs ?? 15_000,
      onOnline: (runIds) => runIds.forEach((runId) => void this.resume(runId)),
    });
  }

  /** つながったら自動で再開するのを待っているか（画面に出す） */
  state(runId: number): ReconnectState | null {
    if (!this.watcher.has(runId)) return null;
    return { attempts: this.attempts.get(runId) ?? 0, max: MAX_AUTO_RESUMES, agents: [...(this.stoppedAgents.get(runId)?.values() ?? [])] };
  }

  /**
   * 作業が終わったとき。送信待ちを送ってよいかを返す（通信で止まったときは送らない）
   */
  finished(runId: number, outcome: RunOutcome): boolean {
    if (outcome.network) {
      this.rememberAgents(runId, outcome.stoppedAgents ?? []);
      this.onNetworkFailure(runId);
      return false;
    }
    // 通信以外で終わった（最後まで・止めた・ほかの失敗）: 止まったサブエージェントの再開は頼まない（一覧の「再開」で戻せる）
    this.stoppedAgents.delete(runId);
    if (outcome.status === "completed") {
      // 最後まで終わった: 数え直し、止めておいた送信待ちを戻す
      this.attempts.delete(runId);
      if (this.heldQueues.delete(runId)) this.deps.followups.setPaused(runId, false);
    } else {
      // 止めた・ほかの理由で失敗した: 自動の再開はやめる（送信待ちは止めたまま。自分で戻せる）
      this.attempts.delete(runId);
      this.heldQueues.delete(runId);
    }
    return true;
  }

  /** 自分でメッセージを送った・止めた・チャットを消した: 待つのも聞くのもやめる */
  forget(runId: number) {
    if (this.resuming.has(runId)) return;
    this.stopWaiting(runId);
    this.attempts.delete(runId);
    this.stoppedAgents.delete(runId);
    this.heldQueues.delete(runId);
    this.asks.get(runId)?.abort();
  }

  /** つながったら自動で再開するのをやめる（画面の「自動で再開しない」）。待っていたら true */
  stopWaiting(runId: number): boolean {
    if (!this.watcher.remove(runId)) return false;
    this.publish(runId);
    return true;
  }

  shutdown() {
    this.watcher.stop();
  }

  private onNetworkFailure(runId: number) {
    const { store, followups } = this.deps;
    const run = store.getRun(runId);
    if (!run) return;
    // 送信待ちを自分で止めていたら、自動では何も送らない（移動の前などに止めている）
    const pausedByUser = followups.isPaused(runId) && !this.heldQueues.has(runId);
    // 送信待ちは送らずに止めておく（通信が切れたまま送ると、次々に失敗して消えるため）
    if (!pausedByUser && followups.list(runId).length > 0 && !followups.isPaused(runId)) {
      followups.setPaused(runId, true);
      this.heldQueues.add(runId);
    }
    const agents = this.agentsNote(runId);
    if (pausedByUser || !store.getSettings().autoResumeOnReconnect) {
      store.addEvent(runId, {
        type: "notice",
        message: `通信が切れたため止まりました。つながってからメッセージを送ると、続きから再開できます。${agents ? `${agents}は、サブエージェントの一覧の「再開」で続きから再開できます。` : ""}`,
      });
      return;
    }
    const attempts = this.attempts.get(runId) ?? 0;
    if (attempts >= MAX_AUTO_RESUMES) {
      this.ask(runId, run.project_id, attempts);
      return;
    }
    store.addEvent(runId, {
      type: "notice",
      message:
        (attempts === 0
          ? "通信が切れたため止まりました。つながったら自動で再開します。"
          : `自動で再開しましたが、また通信が切れました。つながったら再開します（${attempts}/${MAX_AUTO_RESUMES} 回）。`) +
        (agents ? `${agents}も、続きから再開するよう頼みます。` : ""),
    });
    this.watcher.add(runId);
    this.publish(runId);
  }

  /** つながった: 「続けて」を送る（その間に自分で送った・消したなら何もしない） */
  private async resume(runId: number, { count = true }: { count?: boolean } = {}) {
    const { store, isBusy, send } = this.deps;
    this.publish(runId);
    const run = store.getRun(runId);
    if (!run || run.status !== "failed" || isBusy(runId)) return;
    if (count) this.attempts.set(runId, (this.attempts.get(runId) ?? 0) + 1);
    this.resuming.add(runId);
    try {
      await send(runId, resumePrompt(this.agentsToResume(runId)));
    } catch (e) {
      store.addEvent(runId, { type: "error", message: `自動で再開できませんでした: ${errorMessage(e)}` });
    } finally {
      this.resuming.delete(runId);
    }
  }

  /** 何度再開しても続かない: 再開するかを人に聞く（承認のカードと同じ回答待ち。Mac の通知も出る） */
  private ask(runId: number, projectId: number, attempts: number) {
    if (this.asks.has(runId)) return;
    const controller = new AbortController();
    this.asks.set(runId, controller);
    const { decision } = this.deps.approvals.request(
      { runId, projectId },
      {
        kind: "reconnect",
        toolName: "reconnect",
        input: { attempts },
        title: "自動で再開できませんでした",
        description: `通信が切れて止まったため、自動で ${attempts} 回再開しましたが、続けられませんでした。つながっているか確かめてから再開してください。`,
        canRemember: false,
      },
      controller.signal,
    );
    void decision.then((answer) => {
      this.asks.delete(runId);
      this.attempts.delete(runId);
      // 再開する: 数え直して、すぐ「続けて」を送る（また止まったら、つながるのを待つところから）
      if (answer.action === "allow" && !controller.signal.aborted) void this.resume(runId, { count: false });
      else this.heldQueues.delete(runId);
    });
  }

  /** 通信の切断で止まったサブエージェントを覚える（同じものは 1 つにまとめる） */
  private rememberAgents(runId: number, agents: StoppedAgent[]) {
    if (agents.length === 0) return;
    const known = this.stoppedAgents.get(runId) ?? new Map<string, string>();
    for (const a of agents) known.set(a.agentId, a.description);
    this.stoppedAgents.set(runId, known);
  }

  /**
   * 再開を頼むサブエージェント: 覚えたもののうち、いまも通信で止まったままのもの
   * （前の再開で戻ったものは除く。最後まで終わるまでは覚えておき、再開の途中でまた通信が切れても頼み直す）
   */
  private agentsToResume(runId: number): StoppedAgent[] {
    const known = this.stoppedAgents.get(runId);
    if (!known) return [];
    const halted = new Set(networkStoppedSubagents(this.deps.store.listEvents(runId), 0).map((s) => s.agentId));
    return [...known].filter(([agentId]) => halted.has(agentId)).map(([agentId, description]) => ({ agentId, description }));
  }

  /** お知らせに添える、止まったサブエージェントの文（「サブエージェント 2 件（調査、レビュー）」。なければ空） */
  private agentsNote(runId: number): string {
    const names = [...(this.stoppedAgents.get(runId)?.values() ?? [])];
    return names.length > 0 ? `通信で止まったサブエージェント ${names.length} 件（${names.join("、")}）` : "";
  }

  private publish(runId: number) {
    const run = this.deps.store.getRun(runId);
    if (run) this.deps.bus?.publish({ type: "run_reconnect", project_id: run.project_id, run_id: runId, reconnect: this.state(runId) });
  }
}
