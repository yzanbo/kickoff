import type { HookCallbackMatcher, HookEvent, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { KICKOFF_SERVER_NAME, type KickoffTool } from "../kickoffTools.js";
import type { PhasePolicy } from "../phases.js";
import { evaluateReferenceWrite, evaluateScopedToolUse } from "../scope.js";
import { evaluateSelfProtection, type SelfInfo } from "../selfProtection.js";
import type { ProviderRunParams } from "./types.js";

/**
 * 書き込み範囲の制限をフック（PreToolUse）で強制する。フックは権限モードや許可ルールより先に
 * 毎回呼ばれるので、Auto mode やユーザー設定の許可ルールがあっても範囲外には書き込めない。
 */
function scopeHooks(params: ProviderRunParams): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
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

/**
 * エージェントを動かしている Kickoff 自身（プロセス・アプリ本体・保存先・API）を壊すツールの呼び出しを、どのチャットでも断る（selfProtection.ts）。
 * 書き込み範囲の制限と同じく PreToolUse のフックなので、権限モードや許可ルールに関係なく効く
 */
function selfProtectionHook(self: SelfInfo): HookCallbackMatcher {
  return {
    hooks: [
      async (input) => {
        if (input.hook_event_name !== "PreToolUse") return {};
        const result = evaluateSelfProtection(self, input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>);
        if (result.decision === "pass") return {};
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: result.reason } };
      },
    ],
  };
}

/** チャットの実行に付けるフック（自分を守る見張りはいつも、書き込み範囲の制限はあるときだけ） */
export function runHooks(params: ProviderRunParams, self: SelfInfo | undefined): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  const scoped = scopeHooks(params)?.PreToolUse ?? [];
  const matchers = [...(self ? [selfProtectionHook(self)] : []), ...scoped];
  return matchers.length > 0 ? { PreToolUse: matchers } : undefined;
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
