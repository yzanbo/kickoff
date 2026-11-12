import type { HookCallbackMatcher, HookEvent, HookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import type { ChatPolicy } from "../../chat/policy.js";
import { DOCKER_GUARD_DENIED, type DockerGuard } from "../../chat/guard/dockerGuard.js";
import { evaluateHiddenDbAccess } from "../../chat/guard/hiddenDb.js";
import { evaluateReferenceWrite } from "../../chat/guard/scope.js";
import { evaluateSelfProtection, type SelfInfo } from "../../chat/guard/selfProtection.js";
import type { ProviderCallbacks, ProviderTurnParams } from "../types.js";

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
 * AI の Docker の守り（PreToolUse の Bash だけ）: 別の作業場所・ほかのプロジェクトの Docker に手を出すコマンドなら、流す前に承認カードで聞いて待つ
 * （利用者が答えるか、チャットを止めるまで。権限モードに関係なく、Auto mode でも聞く）。［許可］なら何も返さず流し、［拒否］なら断る。「次から聞かない」は出さない
 */
function dockerGuardHook(guard: DockerGuard, cb: Pick<ProviderCallbacks, "requestApproval">): HookCallbackMatcher {
  return {
    matcher: "Bash",
    hooks: [
      async (input: HookInput, _toolUseId, { signal }): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== "PreToolUse" || input.tool_name !== "Bash") return {};
        const command = (input.tool_input as { command?: unknown } | undefined)?.command;
        if (typeof command !== "string") return {};
        // 判定に失敗したら（docker が答えないなど）通す（守りはうっかりを防ぐもので、AI の作業を止めない）
        const ask = await guard.check(command).catch(() => null);
        if (!ask) return {};
        const decision = await cb
          .requestApproval(
            {
              kind: "permission",
              toolName: "Bash",
              input: { command },
              title: ask.title,
              description: ask.description,
              canRemember: false,
              toolUseId: input.tool_use_id,
              ...(input.agent_id ? { agentId: input.agent_id } : {}),
            },
            signal,
          )
          .catch(() => ({ action: "deny" as const, message: "" }));
        if (decision.action === "allow" || decision.action === "allow_always") return {};
        const reason = decision.action === "deny" && decision.message ? `${DOCKER_GUARD_DENIED}（利用者の言葉: ${decision.message}）` : DOCKER_GUARD_DENIED;
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
      },
    ],
  };
}

/**
 * チャットの実行に付けるフック。エージェントを動かしている Kickoff 自身（プロセス・アプリ本体・保存先・API）を壊す呼び出し
 * （selfProtection.ts）はいつも、参照資料への書き込みは参照資料があるときだけ、「見せない」DB の接続に直接入るのは、そういう接続があるときだけ断る。
 * 別の作業場所・ほかのプロジェクトの Docker に手を出す Bash は、守りがあれば承認カードで聞く（dockerGuardHook）。Auto mode や許可ルールがあっても効く
 */
export function turnHooks(
  params: ProviderTurnParams,
  self: SelfInfo | undefined,
  cb: Pick<ProviderCallbacks, "requestApproval">,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  const readOnly = params.readOnlyPaths ?? [];
  const matchers = [
    ...(self ? [denyHook((tool, input) => evaluateSelfProtection(self, tool, input))] : []),
    ...(readOnly.length > 0 ? [denyHook((tool, input) => evaluateReferenceWrite(params.cwd, readOnly, tool, input))] : []),
    ...(params.hiddenDb?.length ? [denyHook((tool, input) => evaluateHiddenDbAccess(params.hiddenDb ?? [], tool, input))] : []),
    ...(params.dockerGuard ? [dockerGuardHook(params.dockerGuard, cb)] : []),
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

/**
 * 実行の初めの指示に文脈を添えるフック（UserPromptSubmit の additionalContext）。作業中に足した発言には添えない（同じ実行の中で 1 回で足りる）。
 * システムプロンプトでは、続きのセッションに届かないため（Claude Code はセッションの prompt_snapshot を使い回す）
 */
export function turnContextHook(context: string): HookCallbackMatcher {
  let sent = false;
  return {
    hooks: [
      async (input) => {
        if (input.hook_event_name !== "UserPromptSubmit" || sent) return {};
        sent = true;
        return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } };
      },
    ],
  };
}
