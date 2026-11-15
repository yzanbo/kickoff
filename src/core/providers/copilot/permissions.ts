import type { PermissionRequest, PermissionRequestResult, SessionConfig } from "@github/copilot-sdk";
import { judgeCommand, judgeReadPath, judgeWritePath, type GuardContext } from "../../chat/guard/judgeTool.js";
import { askApproval, guardOutcome, modeOutcome, type ApprovalContext, type ApprovalOutcome } from "../guardedApproval.js";
import type { ProviderTurnParams } from "../types.js";

/**
 * Copilot SDK の承認と質問に答える（メモの仕様書「0021」の Q3 と「作りながら決める」の承認の決まり。Codex と同じ決まり = guardedApproval.ts）。
 * セッションは manual（すべて聞く）にし、聞かれた権限（shell = コマンド・write = ファイルの変更・read・mcp・url）に Kickoff の守りを当てる:
 * 断る守り → reject（理由は feedback で AI に伝わる）/ 聞く守り（Docker・作業場所の外）→ 権限モードによらず承認カード / 何もなし → 権限モード。
 * 承認を通らないコマンドがあっても断る守りは効くよう、ツールの前のフック（onPreToolUse）でもコマンドに断る守りだけを当てる（聞く守りは承認の側で）
 */

type Hooks = NonNullable<SessionConfig["hooks"]>;
type PreToolUse = NonNullable<Hooks["onPreToolUse"]>;
type UserInputHandler = NonNullable<SessionConfig["onUserInputRequest"]>;

export interface PermissionDeps extends ApprovalContext {
  params: ProviderTurnParams;
  guard: GuardContext;
}

const declined = (what: string, reason: string) => `［Kickoff］${what}を断りました: ${reason}`;

/** 共通の承認の結果を SDK の答えにする */
function toResult(outcome: ApprovalOutcome, what: string): PermissionRequestResult {
  if (outcome.allow) return { kind: outcome.forSession ? "approve-for-session" : "approve-once" };
  return { kind: "reject", feedback: declined(what, outcome.reason) };
}

async function shell(deps: PermissionDeps, req: Extract<PermissionRequest, { kind: "shell" }>): Promise<PermissionRequestResult> {
  const command = req.fullCommandText;
  const what = `コマンド「${command.slice(0, 200)}」`;
  // 砂場の外で流す頼みは受けない（Kickoff の砂場の外で流すコマンドの決まりは Copilot に写せない）
  if (req.requestSandboxBypass) return toResult({ allow: false, reason: "Kickoff のチャットでは、砂場の外でコマンドを流せません" }, what);
  const input = { command };
  const guarded = await guardOutcome(deps, await judgeCommand(deps.guard, command), "Bash", input, req.toolCallId);
  return toResult(guarded ?? (await modeOutcome(deps, "command", "Bash", input, req.toolCallId, req.intention)), what);
}

async function write(deps: PermissionDeps, req: Extract<PermissionRequest, { kind: "write" }>): Promise<PermissionRequestResult> {
  const target = req.resolvedPath ?? req.fileName;
  const what = `ファイルの変更（${req.fileName}）`;
  if (req.requestSandboxBypass) return toResult({ allow: false, reason: "Kickoff のチャットでは、砂場の外に書けません" }, what);
  const guarded = await guardOutcome(deps, await judgeWritePath(deps.guard, target), "Write", { file_path: target }, req.toolCallId);
  if (guarded) return toResult(guarded, what);
  const shown = req.newFileContents !== undefined ? { name: "Write", input: { file_path: target, content: req.newFileContents } } : { name: "Edit", input: { file_path: target, diff: req.diff } };
  return toResult(await modeOutcome(deps, "edit", shown.name, shown.input, req.toolCallId, req.intention), what);
}

/** MCP のツール: 聞かずに使わせるもの（autoAllow）は通し、ほかは権限モード（コマンドと同じ扱い） */
async function mcp(deps: PermissionDeps, req: Extract<PermissionRequest, { kind: "mcp" }>): Promise<PermissionRequestResult> {
  const name = `mcp__${req.serverName}__${req.toolName}`;
  const what = `ツール「${name}」`;
  const endpoint = (deps.params.tools ?? []).find((t) => t.name === req.serverName);
  if (endpoint?.autoAllow.includes(req.toolName)) return { kind: "approve-once" };
  const input = req.args && typeof req.args === "object" && !Array.isArray(req.args) ? (req.args as Record<string, unknown>) : {};
  return toResult(await modeOutcome(deps, "command", name, input, req.toolCallId, req.toolTitle), what);
}

/** 承認の頼み（onPermissionRequest）に答える口 */
export function createPermissionHandler(deps: PermissionDeps): (req: PermissionRequest) => Promise<PermissionRequestResult> {
  return async (req) => {
    switch (req.kind) {
      case "shell":
        return shell(deps, req);
      case "write":
        return write(deps, req);
      case "read": {
        // 読むことは絞らない（自分の保存先・見せない DB のファイルだけ断る）
        const verdict = judgeReadPath(deps.guard, req.resolvedPath ?? req.path);
        return verdict.kind === "deny" ? toResult({ allow: false, reason: verdict.reason }, `ファイルを読むの（${req.path}）`) : { kind: "approve-once" };
      }
      case "mcp":
        return mcp(deps, req);
      // Web（CHAT_POLICY で許している）・Copilot のメモリー・ランタイムのフックは通す
      case "url":
      case "memory":
      case "hook":
        return { kind: "approve-once" };
      default:
        // Kickoff が持たないもの（拡張の管理・独自のツールなど）は断る
        return { kind: "reject", feedback: `［Kickoff］${req.kind} は Kickoff のチャットでは使えません` };
    }
  };
}

/** ツールの前のフック: コマンドに断る守りだけを当てる（Docker の聞く守りは承認の側。承認を通らないコマンドでも断る守りが効くように） */
export function createPreToolUseHook(deps: PermissionDeps): PreToolUse {
  const denyOnly: GuardContext = { ...deps.guard, params: { ...deps.guard.params, dockerGuard: undefined } };
  return async (input) => {
    const args = input.toolArgs && typeof input.toolArgs === "object" ? (input.toolArgs as Record<string, unknown>) : {};
    if (typeof args.command !== "string") return;
    const verdict = await judgeCommand(denyOnly, args.command);
    if (verdict.kind === "deny") return { permissionDecision: "deny", permissionDecisionReason: declined(`コマンド「${args.command.slice(0, 200)}」`, verdict.reason) };
  };
}

/** AI からの質問（Kickoff の質問カード = AskUserQuestion の形に写し、答えの文を返す） */
export function createUserInputHandler(deps: ApprovalContext): UserInputHandler {
  return async (req) => {
    const choices = req.choices ?? [];
    const questions = [{ question: req.question, header: "質問", options: choices.map((label) => ({ label, description: "" })), multiSelect: false }];
    const decision = await askApproval(deps, { kind: "question", toolName: "AskUserQuestion", input: { questions }, canRemember: false });
    const raw = decision.action === "answer" ? decision.answers[req.question] : undefined;
    const answer = raw === undefined ? "" : Array.isArray(raw) ? raw.join(", ") : raw;
    return { answer: answer || "（利用者は答えませんでした）", wasFreeform: !choices.includes(answer) };
  };
}
