// 守りの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { TrashApi } from "@/features/trash/core/index";
import type { AgentSandboxRules } from "./platformRules";
import type { BashSandboxDeps } from "./sandbox/bashSandbox";
import type { NetworkRelay } from "./sandbox/networkRelay";
import type { SandboxDiagnosticsPlatform } from "./sandboxDiagnosticsPlatform";

export type { DenyVerdict } from "./rules";

export interface GuardEnv {
  /** AI の Bash の砂場を付けるか（テストは付けない） */
  sandbox: boolean;
  /** OS ごとの砂場の決まり */
  rules: AgentSandboxRules;
  /** OS の拒否ログを読む口（砂場の診断。なければ診断しない） */
  diagnostics?: SandboxDiagnosticsPlatform;
  /** Bash の通信の中継（起こせなければ null。プロバイダーの中継のまま） */
  relay: NetworkRelay | null;
  /** 置いた kickoff-trash（置けていなければ、砂場でゴミ箱へ書かせない） */
  trashCommandFile?: string;
}

export interface GuardApi {
  /** AI の Bash の砂場（付けなければ undefined） */
  bashSandbox: BashSandboxDeps | undefined;
  /** 砂場の診断（付けなければ undefined） */
  sandboxDiagnostics: SandboxDiagnosticsPlatform | undefined;
}

/** AI の Bash の砂場（書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにする）。通信はどこへでも通す中継を通す（ネットワークは絞らない） */
export function createGuard(deps: { trash: TrashApi }, env: GuardEnv): CoreFeature<GuardApi> {
  const bashSandbox = env.sandbox ? { rules: env.rules, proxyPort: env.relay?.port ?? null, trashDir: env.trashCommandFile ? deps.trash.dir : null } : undefined;
  return {
    name: "guard",
    api: { bashSandbox, sandboxDiagnostics: env.sandbox ? env.diagnostics : undefined },
    stop: async () => {
      await env.relay?.close();
    },
  };
}
