import type { AgentProvider, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "../providers/types.js";
import type { ProviderStatus } from "@shared/types";

/** テスト用の偽のプロバイダーの土台（いつもログイン済み）。run の振る舞いはテストごとに決める。テストからだけ使う */
export abstract class FakeProviderBase implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Fake";
  readonly implemented = true;

  async status(): Promise<ProviderStatus> {
    return { id: this.id, label: this.label, implemented: true, installed: true, logged_in: true, detail: "" };
  }

  abstract run(params: ProviderTurnParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult>;
}

/** 実行の台本（渡された値と知らせ先を見て、結果を返す） */
export type Script = (params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal) => Promise<ProviderTurnResult>;

/** 台本どおりに振る舞う偽のプロバイダー（渡された値を順に覚える） */
export class ScriptedProvider extends FakeProviderBase {
  calls: ProviderTurnParams[] = [];
  constructor(private readonly script: Script) {
    super();
  }
  run(params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal) {
    this.calls.push(params);
    return this.script(params, cb, signal);
  }
}

/** 外から終わらせるまで作業中のままの台本（gates の関数を呼ぶと、その回が完了する。止められたら cancelled） */
export function gatedScript() {
  const gates: (() => void)[] = [];
  const script: Script = (params, _cb, signal) =>
    new Promise((resolve) => {
      gates.push(() => resolve({ status: "completed", sessionId: "s", turns: 1, result: params.prompt }));
      signal.addEventListener("abort", () => resolve({ status: "cancelled", sessionId: "s" }), { once: true });
    });
  return { gates, script };
}
