import type { HookCallbackMatcher, HookEvent, HookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import type { ChatPolicy } from "../../chat/policy.js";
import { evaluateReferenceWrite } from "../../chat/guard/scope.js";
import { evaluateSelfProtection, type SelfInfo } from "../../chat/guard/selfProtection.js";
import type { ProviderRunParams } from "../types.js";

type Decision = { decision: "deny"; reason: string } | { decision: "pass" };

/** ツールの呼び出しを判定して断るフック（PreToolUse）。権限モードや許可ルールより先に毎回呼ばれる */
function denyHook(evaluate: (toolName: string, input: Record<string, unknown>) => Decision): HookCallbackMatcher {
  return {
    hooks: [
      async (input: HookInput): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== "PreToolUse") return {};
        const result = evaluate(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>);
        if (result.decision === "pass") return {};
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: result.reason } };
      },
    ],
  };
}

/**
 * チャットの実行に付けるフック。エージェントを動かしている Kickoff 自身（プロセス・アプリ本体・保存先・API）を壊す呼び出し
 * （selfProtection.ts）はいつも、参照資料への書き込みは参照資料があるときだけ断る。Auto mode や許可ルールがあっても効く
 */
export function runHooks(params: ProviderRunParams, self: SelfInfo | undefined): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  const readOnly = params.readOnlyPaths ?? [];
  const matchers = [
    ...(self ? [denyHook((tool, input) => evaluateSelfProtection(self, tool, input))] : []),
    ...(readOnly.length > 0 ? [denyHook((tool, input) => evaluateReferenceWrite(params.cwd, readOnly, tool, input))] : []),
  ];
  return matchers.length > 0 ? { PreToolUse: matchers } : undefined;
}

/** チャットのポリシーを Claude Code の権限ルールに変換する（ファイルの編集は権限モードに任せる） */
export function toAllowedTools(policy: ChatPolicy): string[] {
  return [
    "Read",
    "Glob",
    "Grep",
    "TodoWrite",
    ...(policy.web ? ["WebSearch", "WebFetch"] : []),
    ...policy.allowedCommands.map((cmd) => `Bash(${cmd}:*)`),
  ];
}
