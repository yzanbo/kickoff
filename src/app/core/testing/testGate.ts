// テスト用の守りの門: 守りの材料から本物の門（guard の gate.ts）を作って params.gate に入れる。テストからだけ使う
import type { ApprovalRequest, GuardMaterials, ProviderCallbacks, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { hiddenDbRule, type HiddenDbTarget } from "@/features/database/core/guard/hiddenDb";
import { dockerRule, type DockerGuard } from "@/features/docker/core/guard/dockerGuard";
import { toolGateFactory } from "@/features/guard/core/gate";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";
import type { GuardRuleSource } from "@/features/guard/core/index";
import { makeProject } from "@shared/projects/testing";

/** テストの守りの材料（見せない DB のつなぎ先・Docker の守りは直に渡す。本物は database・docker がプロジェクトから引く） */
export type TestGuardMaterials = Partial<GuardMaterials> & { hiddenDb?: HiddenDbTarget[]; dockerGuard?: DockerGuard | null };

/** 直に渡した見せない DB・Docker の守りから決まりを出す口（本物の口と同じく、見せない接続があるとき・Docker の守りがあるときだけ付ける） */
export function fixedSources(m: TestGuardMaterials): GuardRuleSource[] {
  const { hiddenDb, dockerGuard } = m;
  return [
    ...(hiddenDb?.length ? [{ name: "hiddenDb" as const, rulesFor: () => [hiddenDbRule(hiddenDb)] }] : []),
    ...(dockerGuard ? [{ name: "docker" as const, rulesFor: () => [dockerRule(dockerGuard)] }] : []),
  ];
}

/** テストの守りの材料を門の材料にする（プロジェクトは作業フォルダを本体にした仮のもの） */
export function testMaterials(m: TestGuardMaterials & { cwd: string }): GuardMaterials {
  const { hiddenDb: _hidden, dockerGuard: _docker, ...rest } = m;
  return { permissionMode: "default", project: makeProject(1, { repo_path: m.cwd }), ...rest };
}

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
  materials: TestGuardMaterials = {},
  self?: SelfInfo,
): T {
  const all = testMaterials({ cwd: params.cwd, permissionMode: params.permissionMode, sandbox: params.sandbox, ...materials });
  const gate = toolGateFactory(self, fixedSources(materials))(all, { requestApproval: requestApproval as ProviderCallbacks["requestApproval"] }, signal);
  return { ...params, gate };
}
