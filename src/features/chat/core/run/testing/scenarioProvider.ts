// 筋書きの偽のプロバイダー: 実行はすべて外から終わらせるまで動いたままにし、足す口・圧縮・記録・承認・終わり方を筋書きの出来事で起こす。テストからだけ使う
import type { AgentProvider, ProviderCallbacks } from "@/features/ai/core/index";
import type { ProviderCliStatus } from "@shared/ai/types";
import type { Outcome } from "./types";

type ProviderTurnParams = Parameters<AgentProvider["run"]>[0];
type ProviderTurnResult = Awaited<ReturnType<AgentProvider["run"]>>;

/** 1 回の実行（渡されたもの・知らせ先・止める合図と、終わらせる口） */
export interface ScenarioRun {
  params: ProviderTurnParams;
  cb: ProviderCallbacks;
  signal: AbortSignal;
  /** 終わったか（止められた・終わらせた） */
  done: boolean;
  finish(result: ProviderTurnResult): void;
}

/** 筋書きの偽のプロバイダー（いつもログイン済みの Claude として振る舞う） */
export class ScenarioProvider implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Fake";
  readonly implemented = true;
  /** 始めた実行（順に） */
  readonly runs: ScenarioRun[] = [];
  /** 作業中に足された発言（足した実行と。順に） */
  readonly told: { run: ScenarioRun; text: string }[] = [];
  /** 承認・質問のカードに受け取った答え（順に） */
  readonly answers: string[] = [];
  /** 足せるか（入力が閉じたら false） */
  tellOk = true;
  /** 次からの実行は、tellReady まで足す口を作らない */
  tellLate = false;
  /** いま動いている実行の数と、その最大 */
  active = 0;
  maxActive = 0;

  async status(): Promise<ProviderCliStatus> {
    return { id: this.id, label: this.label, implemented: true, installed: true, logged_in: true, detail: "" };
  }

  run(params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
    return new Promise((resolve) => {
      this.active++;
      this.maxActive = Math.max(this.maxActive, this.active);
      const run: ScenarioRun = {
        params,
        cb,
        signal,
        done: false,
        finish: (result) => {
          if (run.done) return;
          run.done = true;
          this.active--;
          resolve(result);
        },
      };
      this.runs.push(run);
      // 止められたら、すぐ中断で終わる（サブエージェントを待たない。会話はそのまま）
      const stop = () => run.finish({ status: "cancelled", sessionId: params.resumeSessionId });
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
      if (!this.tellLate) this.openTell(run);
    });
  }

  /** 足す口を作る（終わった実行・入力が閉じたときは足せない） */
  openTell(run: ScenarioRun) {
    run.cb.control?.({ tell: (text) => !run.done && this.tellOk && Boolean(this.told.push({ run, text })), stopTask: async () => {} });
  }

  /** 終わらせる（終わり方から結果を作る） */
  end(run: ScenarioRun, outcome: Outcome, { session: sessionId, context, at }: { session: string | null; context?: { tokens: number; window: number }; at: (ms: number) => string }) {
    if (outcome === "completed") run.finish({ status: "completed", sessionId, result: "ok", turns: 1, lastMessageId: `m${this.runs.indexOf(run) + 1}`, ...(context ? { context } : {}) });
    else if (outcome === "failed") run.finish({ status: "failed", sessionId, error: "失敗しました" });
    else if (outcome === "cancelled") run.finish({ status: "cancelled", sessionId });
    else if (outcome === "network") run.finish({ status: "failed", sessionId, error: "API Error: Connection error.", network: true });
    else run.finish({ status: "failed", sessionId, error: "Claude AI usage limit reached", usageLimit: { resetsAt: outcome.usage_limit === null ? null : at(outcome.usage_limit) } });
  }

  /** 承認・質問のカードを出し、答えを覚える */
  askCard(run: ScenarioRun, kind: "permission" | "question") {
    const request = kind === "permission" ? { kind, toolName: "Bash", input: { command: "ls" }, canRemember: false } : { kind, toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false };
    void run.cb.requestApproval(request, run.signal).then((answer) => this.answers.push(answer.action));
  }
}
