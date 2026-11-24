import path from "node:path";
import { realPathLoose } from "@/foundation/core/system/paths";
import { PLAN_MODE_DECLINED } from "@/features/ai/core/permissionMode";
import type { ProviderCallbacks, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { hookDeny, patchPaths, type PreToolUseInput } from "./hooks";

/**
 * Codex の PreToolUse フックの判定。Claude Code の PreToolUse と同じく、流す前に守りを当てる:
 * 断る守り → 断って理由を AI に / 聞く守り（Docker・作業場所の外）→ 権限モードによらず承認カード / 何もなし → 権限モード
 * （Auto mode = 通す・編集を自動承認 = ファイルの変更だけ通す・毎回確認 = 聞く・計画 = コマンドは Codex の読むだけの砂場に任せて通し、ファイルの変更は断る）。
 * 通すときは何も言わない（Codex の砂場と承認の決まりはそのまま効く）。
 * フックで止めた呼び出しは Codex が会話の項目を出さないので、ここで道具の呼び出しと断った理由を記録に残す（
 * コードモード（exec）の中の呼び出しにもフックは当たる）
 */

export interface PreToolUseDeps {
  cb: Pick<ProviderCallbacks, "emit">;
  params: ProviderTurnParams;
  /** フックで利用者が許した書く先（実体のパス）。あとで同じファイルの変更の承認が来ても聞き直さない（approvals.ts） */
  approvedWrites: Set<string>;
}

/** 書く先の実体のパス（作業場所からの相対パスも） */
export const writeKey = (cwd: string, filePath: string) => realPathLoose(path.resolve(cwd, filePath));

async function commandHook(deps: PreToolUseDeps, command: string, toolUseId: string | undefined): Promise<object | null> {
  const call = { name: "Bash", input: { command } };
  const guarded = await deps.params.gate.guard(call, { toolUseId });
  if (guarded) return guarded.allow ? null : hookDeny(guarded.reason);
  const mode = deps.params.permissionMode;
  // 計画モードのコマンドは Codex の読むだけの砂場で流す（読むコマンドは使える）
  if (mode === "plan" || mode === "auto") return null;
  const outcome = await deps.params.gate.byMode("command", call, { toolUseId });
  return outcome.allow ? null : hookDeny(outcome.reason);
}

async function patchHook(deps: PreToolUseDeps, patch: string, toolUseId: string | undefined): Promise<object | null> {
  if (deps.params.permissionMode === "plan") return hookDeny(PLAN_MODE_DECLINED);
  const paths = patchPaths(patch);
  // 変えるファイルが分からなければ通さない（守りを当てられないため）
  if (paths.length === 0) return hookDeny("変えるファイルが分からないため、Kickoff の守りを当てられませんでした");
  // 聞いて許した書く先だけを覚えるので、1 つずつ当てる（guardWrites はまとめた答えしか返さない）
  let asked = false;
  for (const target of paths) {
    const guarded = await deps.params.gate.guard({ name: "Write", input: { file_path: target } }, { toolUseId });
    if (guarded && !guarded.allow) return hookDeny(guarded.reason);
    if (guarded) {
      asked = true;
      deps.approvedWrites.add(writeKey(deps.params.cwd, target));
    }
  }
  if (asked) return null;
  const input = { file_path: paths[0], ...(paths.length > 1 ? { files: paths } : {}) };
  const outcome = await deps.params.gate.byMode("edit", { name: "Write", input }, { toolUseId });
  if (!outcome.allow) return hookDeny(outcome.reason);
  for (const target of paths) deps.approvedWrites.add(writeKey(deps.params.cwd, target));
  return null;
}

/** フックで止めた呼び出しを記録に残す（道具の呼び出しと、断った理由の結果） */
function recordDenied(deps: PreToolUseDeps, id: string, name: string, input: Record<string, unknown>, answer: object | null): void {
  const reason = (answer as ReturnType<typeof hookDeny> | null)?.hookSpecificOutput?.permissionDecisionReason;
  if (!reason) return;
  deps.cb.emit({ type: "tool_use", id, name, input });
  deps.cb.emit({ type: "tool_result", tool_use_id: id, content: reason, is_error: true });
}

/** フックの口（hookServer.ts）の判定。シェルのコマンドとパッチのほかは何も言わない */
export function createPreToolUseHandler(deps: PreToolUseDeps): (input: unknown) => Promise<object | null> {
  let seq = 0;
  return async (raw) => {
    const input = raw as PreToolUseInput;
    const text = typeof input.tool_input?.command === "string" ? input.tool_input.command : null;
    if (text === null) return null;
    const id = input.tool_use_id ?? `hook-${++seq}`;
    if (input.tool_name === "Bash") {
      const answer = await commandHook(deps, text, input.tool_use_id);
      recordDenied(deps, id, "Bash", { command: text }, answer);
      return answer;
    }
    if (input.tool_name === "apply_patch") {
      const answer = await patchHook(deps, text, input.tool_use_id);
      const paths = patchPaths(text);
      recordDenied(deps, id, "Write", { file_path: paths[0] ?? "", ...(paths.length > 1 ? { files: paths } : {}) }, answer);
      return answer;
    }
    return null;
  };
}
