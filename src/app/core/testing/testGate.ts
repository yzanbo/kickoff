// テスト用の守りの門: 実行の指定の守りの材料から、本物の門（guard の gate.ts）を作って params.gate に入れる。テストからだけ使う
import type { ApprovalRequest, ProviderCallbacks, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { hiddenDbRuleSource } from "@/features/database/core/guard/hiddenDb";
import { dockerRuleSource } from "@/features/docker/core/guard/dockerGuard";
import { toolGateFactory } from "@/features/guard/core/gate";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";

/** 承認カードの答え（省けば断る） */
const denyAll: ProviderCallbacks["requestApproval"] = async () => ({ action: "deny", message: "" });

/** params の守りの材料（cwd・権限モード・参照資料・消すコマンド・Docker・書き込み先 など）で門を作り、params.gate に入れた写しを返す（signal: 承認カードを待つのをやめる合図 = 実行の signal） */
export function withGate<T extends ProviderTurnParams>(params: T, requestApproval: (req: ApprovalRequest, signal: AbortSignal) => Promise<unknown> = denyAll, signal = new AbortController().signal, self?: SelfInfo): T {
  const gate = toolGateFactory(self, [hiddenDbRuleSource, dockerRuleSource])(params, { requestApproval: requestApproval as ProviderCallbacks["requestApproval"] }, signal);
  return { ...params, gate };
}
