// 守りの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { TrashApi } from "@/features/trash/core/index";
import type { AiApi } from "@/features/ai/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import { toolGateFactory } from "./gate";
import type { SelfInfo } from "./guard/selfProtection";
import type { AgentSandboxRules } from "./platformRules";
import type { BashSandboxDeps } from "./sandbox/bashSandbox";
import type { NetworkRelay } from "./sandbox/networkRelay";
import type { SandboxDiagnosticsPlatform } from "./sandboxDiagnosticsPlatform";

import type { GuardRuleSource } from "./rules";
import { diagnosticToolGroup } from "./tools";
import { guardTurnParts } from "./turnParts";

export type { DenyVerdict, GuardRule, GuardRuleSource } from "./rules";
export { guardTurnParts, type GuardTurnDeps } from "./turnParts";
export { diagnosticToolGroup } from "./tools";

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
  /** エージェントを動かしている Kickoff 自身（自分を守る守り。テストは渡さない） */
  self?: SelfInfo;
}

export interface GuardApi {
  /** 上の機能が守りの決まりを出す口を足す（database = 見せない DB・docker = ほかの作業場所の Docker） */
  addRuleSource(source: GuardRuleSource): void;
}

/**
 * 守り: チャットの実行ごとに守りの門・AI の Bash の砂場（書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにする）・砂場の診断を足す（chat に contributor を登録する）。
 * 通信はどこへでも通す中継を通す（ネットワークは絞らない）
 */
export function createGuard(deps: { trash: TrashApi; ai: Pick<AiApi, "providers">; chat: Pick<ChatApi, "addTurnContributor" | "onForget" | "store"> }, env: GuardEnv): CoreFeature<GuardApi> {
  const sources: GuardRuleSource[] = [];
  const bashSandbox: BashSandboxDeps | undefined = env.sandbox ? { rules: env.rules, proxyPort: env.relay?.port ?? null, trashDir: env.trashCommandFile ? deps.trash.dir : null } : undefined;
  const contributor = guardTurnParts({
    toolGate: toolGateFactory(env.self, sources),
    bashSandbox,
    diagnostics: env.sandbox ? env.diagnostics : undefined,
    deleteGuard: env.trashCommandFile !== undefined,
    providers: deps.ai.providers,
    projects: () => deps.chat.store.projects.list(),
  });
  deps.chat.addTurnContributor(contributor);
  // 消したチャットの「このチャットでは許可」の覚えを捨てる
  deps.chat.onForget((chatId) => contributor.forget(chatId));
  return {
    name: "guard",
    api: { addRuleSource: (source) => void sources.push(source) },
    aiTools: [diagnosticToolGroup],
    stop: async () => {
      await env.relay?.close();
    },
  };
}
export { normalizeCommand } from "./guard/selfProtection";
