import path from "node:path";
import type { HookCallbackMatcher, HookEvent, SyncHookJSONOutput } from "./wire";
import { realPathLoose } from "@/foundation/core/system/paths";
import type { GateCall, ProviderTurnParams, WriteExceptions } from "@/features/ai/core/providers/types";
import { claudeProjectsDir } from "./internals";
import { APPROVAL_WAIT_S } from "@/features/ai/core/providers/shared/turnLifecycle";

/** 利用者が Kickoff の承認カードで許したときの答えの理由（Claude Code の作業フォルダの外の確かめで同じことを 2 回聞かないよう許す） */
const APPROVED_REASON = "利用者が Kickoff の承認カードで許可しました";

/** PreToolUse の答え（許す・断る） */
const decide = (permissionDecision: "allow" | "deny", reason: string): SyncHookJSONOutput => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason: reason },
});

/** 門に当てる呼び出し（Bash はコマンドだけ。承認カードに出す入力もコマンドだけにする） */
function gateCallOf(name: string, input: Record<string, unknown>): GateCall {
  return name === "Bash" && typeof input.command === "string" ? { name, input: { command: input.command } } : { name, input };
}

/**
 * 守りのフック（PreToolUse。どのツールにも、権限モードや許可ルールより先に毎回呼ばれる）: 呼び出しを守りの門（params.gate）に当て、
 * 断る守り → 断る / 聞く守り（Docker・作業場所の外への書き込み）→ 権限モードに関係なく承認カードで聞いて待つ / 何も言わなければ Claude Code の権限の仕組みに任せる。
 * 書き込み先のカードで許した（いま・「このチャットでは許可」で前に）ものは許して流す（計画モードは権限モードに任せる）。Docker のカードで許したものは何も返さずに流す。
 * 待ち時間は承認カードを待つ長さ（書かないと Claude Code の既定の待ち時間で止める知らせが来て、利用者が答える前にカードが閉じて「拒否」になる）。
 * カードはフックの止める知らせ（signal）で閉じる
 */
function guardHook(params: ProviderTurnParams): HookCallbackMatcher {
  const { gate } = params;
  const approved: SyncHookJSONOutput = params.permissionMode === "plan" ? {} : decide("allow", APPROVED_REASON);
  return {
    timeout: APPROVAL_WAIT_S,
    hooks: [
      async (input, _toolUseId, { signal }): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== "PreToolUse") return {};
        const call = gateCallOf(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>);
        const outcome = await gate.guard(call, { toolUseId: input.tool_use_id, ...(input.agent_id ? { agentId: input.agent_id } : {}), signal });
        if (outcome === null) return gate.remembered(call) ? approved : {};
        if (!outcome.allow) return decide("deny", outcome.reason);
        return outcome.approved ? approved : {};
      },
    ],
  };
}

/**
 * スキル・スラッシュコマンドの本文に書いたシェルのコマンド（読み込むときに流れ、PreToolUse を通らない）にも守りの門を当てるフック（PreSkillShellCommand）。
 * このフックで効く答えは断るだけ（allow は何も足さない）なので、断る守りと、聞く守りのカードで断られたときだけ断る。
 * 会話記録のツールの呼び出しではない（tool_use_id はどの呼び出しも指さない）ので、カードに呼び出し ID は付けない
 */
function skillShellGuardHook(params: ProviderTurnParams): HookCallbackMatcher {
  return {
    timeout: APPROVAL_WAIT_S,
    hooks: [
      async (input, _toolUseId, { signal }): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== "PreSkillShellCommand") return {};
        const call = gateCallOf(input.tool_name, input.tool_input);
        const outcome = await params.gate.guard(call, { ...(input.agent_id ? { agentId: input.agent_id } : {}), signal });
        if (outcome === null || outcome.allow) return {};
        return { hookSpecificOutput: { hookEventName: "PreSkillShellCommand", permissionDecision: "deny", permissionDecisionReason: outcome.reason } };
      },
    ],
  };
}

/**
 * 砂場で止まったときの文（門の sandboxDeniedNote）を、失敗で終わった Bash の結果のあとに AI へ添えるフック（PostToolUseFailure の additionalContext）。
 * 成功したコマンド（PostToolUse）は見ない: ソース・ログ・テストを読んだだけの出力に OS の文の形が入っていても、砂場が断ったとは限らないため。
 * Claude Code は失敗の終了コードを PostToolUseFailure で知らせる（0 以外でも失敗でないもの = grep・diff の 1 などは PostToolUse）
 */
function sandboxDeniedHook(params: ProviderTurnParams): HookCallbackMatcher {
  return {
    matcher: "Bash",
    hooks: [
      async (input): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== "PostToolUseFailure") return {};
        const note = await params.gate.sandboxDeniedNote(input.error).catch(() => null);
        if (note === null) return {};
        return { hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: note } };
      },
    ],
  };
}

/**
 * チャットの実行に付けるフック: 守りのフック（ツールの PreToolUse とスキルのシェルの PreSkillShellCommand に 1 つずつ。守りの中身と並びは guard の門）と、
 * Bash の砂場があれば、砂場で書き込みを断られたときに、どこを・なぜ・代わりの道を結果に書き添えるフック。Auto mode や許可ルールがあっても効く
 */
export function turnHooks(params: ProviderTurnParams): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [guardHook(params)],
    PreSkillShellCommand: [skillShellGuardHook(params)],
    ...(params.sandbox ? { PostToolUseFailure: [sandboxDeniedHook(params)] } : {}),
  };
}

/**
 * Claude Code の決まりでいつも書ける場所（書き込み先の守りが聞かずに通す）: 計画 ~/.claude/plans と、メモリ ~/.claude/projects/<プロジェクト>/memory
 * （CLAUDE_CONFIG_DIR があればその下。実行のたびに読む）
 */
export function claudeWriteExceptions(): WriteExceptions {
  const projects = realPathLoose(claudeProjectsDir());
  return { writableDirs: [realPathLoose(path.join(path.dirname(projects), "plans"))], memoryParents: [projects] };
}

/**
 * Kickoff のチャットでは使わせない Claude Code のツール（`disallowedTools`）。
 * - PushNotification: Claude のアプリ・端末に送るもので Kickoff の利用者に届かない（知らせるのは kickoff_chat の notify_user）
 * - EnterWorktree / ExitWorktree: 会話ごと別のフォルダへ移る。チャットの作業場所は Kickoff が決めて覚えるもので、
 *   途中で移ると画面の表示・Git と差分・書き込み先の守りと Bash の砂場・ポートの帯・ワークツリーの片付けがすべてずれるため
 *   （書き換えを分けるときは Kickoff のワークツリーで。サブエージェントの isolation: "worktree" はメインエージェントの作業場所を変えないので使える）
 * ほかの AI（Codex・Copilot・Cursor・Gemini）に同じ働き（会話ごと作業場所を移す）のツールが足されたら、その AI でも同じ決まりで外す
 */
export const KICKOFF_DISALLOWED_TOOLS = ["PushNotification", "EnterWorktree", "ExitWorktree"];

/** 承認なしで流してよいコマンド（門の allowedCommands）を Claude Code の権限ルールに変換する（読む・Web は承認なし。ファイルの編集は権限モードに任せる） */
export function toAllowedTools(allowedCommands: readonly string[]): string[] {
  return ["Read", "Glob", "Grep", "TodoWrite", "WebSearch", "WebFetch", ...allowedCommands.map((cmd) => `Bash(${cmd}:*)`)];
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
