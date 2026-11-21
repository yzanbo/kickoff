// テスト用の守りの門: 守りの材料から本物の門（guard の gate.ts）を作って params.gate に入れる。テストからだけ使う
import type { ApprovalRequest, GuardMaterials, ProviderCallbacks, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { hiddenDbRuleSource } from "@/features/database/core/guard/hiddenDb";
import { dockerRuleSource } from "@/features/docker/core/guard/dockerGuard";
import { toolGateFactory } from "@/features/guard/core/gate";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";

/** 承認カードの答え（省けば断る） */
const denyAll: ProviderCallbacks["requestApproval"] = async () => ({ action: "deny", message: "" });

/**
 * 守りの材料（params の cwd・権限モード・砂場に、materials の参照資料・消すコマンド・Docker・書き込み先 などを重ねたもの）で門を作り、
 * params.gate に入れた写しを返す（signal: 承認カードを待つのをやめる合図 = 実行の signal）
 */
export function withGate<T extends ProviderTurnParams>(
  params: T,
  requestApproval: (req: ApprovalRequest, signal: AbortSignal) => Promise<unknown> = denyAll,
  signal = new AbortController().signal,
  materials: Partial<GuardMaterials> = {},
  self?: SelfInfo,
): T {
  const all: GuardMaterials = { cwd: params.cwd, permissionMode: params.permissionMode, sandbox: params.sandbox, ...materials };
  const gate = toolGateFactory(self, [hiddenDbRuleSource, dockerRuleSource])(all, { requestApproval: requestApproval as ProviderCallbacks["requestApproval"] }, signal);
  return { ...params, gate };
}
