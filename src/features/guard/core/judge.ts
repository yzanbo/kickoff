// 守りの決まりの並びを、1 つの呼び出しに当てる
import { GUARD_ORDER, type GuardCall, type GuardRule, type GuardVerdict } from "./rules";

const orderOf = (rule: GuardRule) => GUARD_ORDER.indexOf(rule.name);

/**
 * 断る守りを GUARD_ORDER の順に全部見て、最初の deny を返す。なければ聞く守りを順に見て、最初の ask を返す（どれも言わなければ pass）。
 * 呼び出しのパスは作業フォルダで解いておく（resolveCallPaths）。判定に失敗したら通す守り（Docker）は、その守りの check が pass を返す
 */
export async function judgeCall(rules: readonly GuardRule[], call: GuardCall): Promise<GuardVerdict> {
  const ordered = [...rules].sort((a, b) => orderOf(a) - orderOf(b));
  for (const kind of ["deny", "ask"] as const) {
    for (const rule of ordered) {
      if (rule.kind !== kind || !rule.sees(call)) continue;
      const verdict = await rule.check(call);
      if (verdict.kind !== "pass") return verdict;
    }
  }
  return { kind: "pass" };
}
