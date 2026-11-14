import path from "node:path";
import type { HookCallbackMatcher, HookEvent, HookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import type { ChatPolicy } from "../../chat/policy.js";
import { DOCKER_GUARD_DENIED, type DockerGuard } from "../../chat/guard/dockerGuard.js";
import { evaluateDeleteCommand } from "../../chat/guard/deleteGuard.js";
import { evaluateHiddenDbAccess } from "../../chat/guard/hiddenDb.js";
import { evaluateReferenceWrite, evaluateUntrackedWrite, writeTargetOf } from "../../chat/guard/scope.js";
import { evaluateSelfProtection, type SelfInfo } from "../../chat/guard/selfProtection.js";
import { judgeFileWrite, WRITE_SCOPE_DENIED, type WriteScopeFacts, type WriteScopeParams } from "../../chat/guard/writeScope.js";
import { realPathLoose, realPathOrSelf } from "../../system/paths.js";
import type { ProviderCallbacks, ProviderTurnParams } from "../types.js";
import { claudeProjectsDir } from "./sessionFiles.js";

type Decision = { decision: "deny"; reason: string } | { decision: "pass" };
type Evaluate = (toolName: string, input: Record<string, unknown>) => Decision | Promise<Decision>;

/**
 * 承認カードで聞く守り（Docker・書き込み先）のフックの待ち時間（秒）。Claude Code は待ち時間を書いていないフックに既定の待ち時間を当て、過ぎると止める知らせ（signal）を送るので、
 * 書かないと利用者が答える前に承認カードが閉じて「拒否」になる。利用者が答えるか、チャットを止めるまで待つよう長くする（タイマーの上限 24.8 日より短く）
 */
const ASKING_GUARD_HOOK_TIMEOUT_S = 7 * 24 * 60 * 60;

/** ツールの呼び出しを判定して断るフック（PreToolUse）。権限モードや許可ルールより先に毎回呼ばれる */
function denyHook(evaluate: Evaluate): HookCallbackMatcher {
  return {
    hooks: [
      async (input: HookInput): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== "PreToolUse") return {};
        const result = await evaluate(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>);
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
    timeout: ASKING_GUARD_HOOK_TIMEOUT_S,
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
 * 書き込み先の守りの判定に使う様子: チャットが渡したもの（作業場所・メモのフォルダ・作業場所の一覧）に、Claude Code の決まりの例外
 * （計画 ~/.claude/plans と、メモリ ~/.claude/projects/<プロジェクト>/memory。CLAUDE_CONFIG_DIR があればその下）を足す
 */
function writeScopeFacts(cwd: string, scope: WriteScopeParams): WriteScopeFacts {
  const projects = realPathLoose(claudeProjectsDir());
  return {
    workdir: realPathOrSelf(cwd),
    writableDirs: [...scope.writableDirs, realPathLoose(path.join(path.dirname(projects), "plans"))],
    memoryParents: [projects],
    workplaces: scope.workplaces,
  };
}

/**
 * AI の書き込み先の守り（PreToolUse のファイルを書き換えるツールだけ。chat/guard/writeScope.ts）: 同じリポジトリのほかの作業場所なら断り、
 * 作業場所・メモのフォルダ・例外の外なら承認カードで聞いて待つ（権限モードに関係なく、Auto mode でも聞く）。ほかの守りが断るもの（参照資料・Kickoff の保存先・
 * 見せない DB）はカードを出さずにそちらに任せる。［許可］［このチャットでは許可］なら許して流す（計画モードは権限モードに任せる）。後者はそのファイルをチャットの間もう聞かない
 */
function writeScopeHook(params: ProviderTurnParams, scope: WriteScopeParams, deniedElsewhere: Evaluate[], cb: Pick<ProviderCallbacks, "requestApproval">): HookCallbackMatcher {
  const facts = writeScopeFacts(params.cwd, scope);
  // 利用者が許したら、Claude Code の作業フォルダの外の確かめで同じことを 2 回聞かないよう許す（計画モードでは書かせないので、権限モードに任せる）
  const allowed: SyncHookJSONOutput =
    params.permissionMode === "plan" ? {} : { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "利用者が Kickoff の承認カードで許可しました" } };
  const deny = (reason: string): SyncHookJSONOutput => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
  return {
    matcher: "Write|Edit|MultiEdit|NotebookEdit",
    timeout: ASKING_GUARD_HOOK_TIMEOUT_S,
    hooks: [
      async (input: HookInput, _toolUseId, { signal }): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== "PreToolUse") return {};
        const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
        const target = writeTargetOf(params.cwd, input.tool_name, toolInput);
        if (target === null) return {};
        if (scope.allowed.has(target)) return allowed;
        for (const evaluate of deniedElsewhere) if ((await evaluate(input.tool_name, toolInput)).decision === "deny") return {};
        const judged = await judgeFileWrite(target, facts);
        if (judged.kind === "pass") return {};
        if (judged.kind === "deny") return deny(judged.reason);
        const decision = await cb
          .requestApproval(
            {
              kind: "permission",
              toolName: input.tool_name,
              input: toolInput,
              title: judged.title,
              description: judged.description,
              canRemember: true,
              rememberScope: "chat",
              toolUseId: input.tool_use_id,
              ...(input.agent_id ? { agentId: input.agent_id } : {}),
            },
            signal,
          )
          .catch(() => ({ action: "deny" as const, message: "" }));
        if (decision.action === "allow_always") scope.allowed.add(target);
        if (decision.action === "allow" || decision.action === "allow_always") return allowed;
        return deny(decision.action === "deny" && decision.message ? `${WRITE_SCOPE_DENIED}（利用者の言葉: ${decision.message}）` : WRITE_SCOPE_DENIED);
      },
    ],
  };
}

/**
 * チャットの実行に付けるフック。エージェントを動かしている Kickoff 自身（プロセス・アプリ本体・保存先・API）を壊す呼び出し
 * （selfProtection.ts）はいつも、参照資料への書き込みは参照資料があるときだけ、「見せない」DB の接続に直接入るのは、そういう接続があるときだけ断る。
 * Git で管理していないファイルだけを書けるチャット（untrackedOnly）は、Git で管理しているファイルの書き込みと Git の中身を変える git のコマンドを断る。
 * ファイルを消す Bash（rm・git clean など）は、守りを付けたときは断って kickoff-trash を使わせる（deleteGuard）。
 * 別の作業場所・ほかのプロジェクトの Docker に手を出す Bash は、守りがあれば承認カードで聞く（dockerGuardHook）。
 * ファイルを書き換えるツールの先は、守りがあれば作業場所・メモのフォルダ・例外だけにし、同じリポジトリのほかの作業場所は断り、それ以外の外は承認カードで聞く（writeScopeHook）。
 * Auto mode や許可ルールがあっても効く
 */
export function turnHooks(
  params: ProviderTurnParams,
  self: SelfInfo | undefined,
  cb: Pick<ProviderCallbacks, "requestApproval">,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  const readOnly = params.readOnlyPaths ?? [];
  // ファイルのツールを断る守り（書き込み先の守りは、これらが断るものにはカードを出さない）
  const fileDenials: Evaluate[] = [
    ...(self ? [(tool: string, input: Record<string, unknown>) => evaluateSelfProtection(self, tool, input)] : []),
    ...(readOnly.length > 0 ? [(tool: string, input: Record<string, unknown>) => evaluateReferenceWrite(params.cwd, readOnly, tool, input)] : []),
    ...(params.untrackedOnly ? [(tool: string, input: Record<string, unknown>) => evaluateUntrackedWrite(params.cwd, tool, input)] : []),
    ...(params.hiddenDb?.length ? [(tool: string, input: Record<string, unknown>) => evaluateHiddenDbAccess(params.hiddenDb ?? [], tool, input)] : []),
  ];
  const matchers = [
    ...fileDenials.map(denyHook),
    ...(params.deleteGuard ? [denyHook((tool, input) => evaluateDeleteCommand(tool, input))] : []),
    ...(params.dockerGuard ? [dockerGuardHook(params.dockerGuard, cb)] : []),
    ...(params.writeScope ? [writeScopeHook(params, params.writeScope, fileDenials, cb)] : []),
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
