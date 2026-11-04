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
