import type { HookCallbackMatcher, HookEvent, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { KICKOFF_SERVER_NAME, type KickoffTool } from "../kickoffTools.js";
import type { PhasePolicy } from "../phases.js";
import { evaluateReferenceWrite, evaluateScopedToolUse } from "../scope.js";
import type { ProviderRunParams } from "./types.js";

/**
 * 書き込み範囲の制限をフック（PreToolUse）で強制する。フックは権限モードや許可ルールより先に
 * 毎回呼ばれるので、Auto mode やユーザー設定の許可ルールがあっても範囲外には書き込めない。
 */
export function scopeHooks(params: ProviderRunParams): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  const scope = params.policy.writeScope;
  const readOnly = params.readOnlyPaths ?? [];
  if (!scope && readOnly.length === 0) return undefined;
  return {
    PreToolUse: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PreToolUse") return {};
            const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
            // 参照資料への書き込みは、どのセクションでも止める。そのあとで、セクションの書き込み範囲を判定する
            const ref = evaluateReferenceWrite(params.cwd, readOnly, input.tool_name, toolInput);
            const result = ref.decision !== "pass" || !scope ? ref : evaluateScopedToolUse(params.cwd, scope, input.tool_name, toolInput);
            if (result.decision === "pass") return {};
            return {
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: result.decision,
                permissionDecisionReason: result.reason,
              },
            };
          },
        ],
      },
    ],
  };
}

/** チャット欄で選んだ権限モード。"phase" ならフェーズのポリシーから決める */
export function resolvePermissionMode(params: Pick<ProviderRunParams, "permissionMode" | "policy">): PermissionMode {
  if (params.permissionMode !== "phase") return params.permissionMode;
  return params.policy.autoEdit ? "acceptEdits" : "default";
}

/** フェーズのポリシーを Claude Code の権限ルールに変換する */
export function toAllowedTools(policy: PhasePolicy, tools: KickoffTool[]): string[] {
  return [
    "Read",
    "Glob",
    "Grep",
    "TodoWrite",
    ...(policy.web ? ["WebSearch", "WebFetch"] : []),
    ...(policy.autoEdit ? ["Edit", "Write", "NotebookEdit"] : []),
    ...policy.allowedCommands.map((cmd) => `Bash(${cmd}:*)`),
    ...tools.map((t) => `mcp__${KICKOFF_SERVER_NAME}__${t.name}`),
  ];
}
