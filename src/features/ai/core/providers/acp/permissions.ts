import { judgeCommand, judgeReadPath, judgeWritePath, type GuardContext } from "@/features/guard/core/guard/judgeTool";
import { guardOutcome, modeOutcome, PLAN_MODE_DECLINED, type ApprovalContext, type ApprovalOutcome } from "@/features/ai/core/providers/guardedApproval";
import type { ToolEndpoint } from "@/foundation/core/aiTools/host";
import type { PermissionOptionKind, RequestPermissionRequest, RequestPermissionResponse, ToolCall } from "./protocol";
import { callAsTools, commandOf, mcpToolOf, pathsOf } from "./updates";

/**
 * ACP の権限の頼み（session/request_permission）に答える。
 * エージェントは「毎回聞く」モードで動かし（config.ts の modeFor）、聞かれたツールに Kickoff の守り（chat/guard/judgeTool.ts）を当てる:
 * 断る守り → reject / 聞く守り（Docker・作業場所の外）→ 権限モードによらず承認カード / 何もなし → 権限モード（決まりは Codex・Copilot と共通の guardedApproval.ts）。
 * 読む・探す・取ってくるは、守り（自分の保存先・見せない DB）が断るときのほかは聞かずに通す（Claude Code と同じ）。
 * ACP の答えには理由の欄がないので、断った理由は denied で受け取り、turn.ts がいまの指示が終わったあとに次の指示として伝える
 */

export interface PermissionDeps extends ApprovalContext {
  guard: GuardContext;
  tools: ToolEndpoint[];
  /** 断った理由（AI に伝える文） */
  denied(note: string): void;
}

const READ_KINDS = new Set(["read", "search", "fetch", "think", "switch_mode"]);

/** 結果の種類に合う選択肢を選ぶ（通す: このセッションの間なら allow_always → allow_once。断る: reject_once → reject_always） */
export function optionFor(request: RequestPermissionRequest, outcome: ApprovalOutcome): RequestPermissionResponse {
  const order: PermissionOptionKind[] = outcome.allow ? (outcome.forSession ? ["allow_always", "allow_once"] : ["allow_once", "allow_always"]) : ["reject_once", "reject_always"];
  for (const kind of order) {
    const option = request.options.find((o) => o.kind === kind);
    if (option) return { outcome: { outcome: "selected", optionId: option.optionId } };
  }
  // 合う選択肢がなければ、通すときも取り消し（cancelled）にはせず断る側に倒す
  const reject = request.options.find((o) => o.kind.startsWith("reject"));
  return reject ? { outcome: { outcome: "selected", optionId: reject.optionId } } : { outcome: { outcome: "cancelled" } };
}

const what = (call: ToolCall) => `「${(call.title ?? call.name ?? call.kind ?? "ツール").slice(0, 200)}」`;

/** 頼まれたツールを守りと権限モードで決める */
async function decide(deps: PermissionDeps, call: ToolCall): Promise<ApprovalOutcome> {
  const shown = callAsTools(call, deps.tools.map((t) => t.name))[0] ?? { name: "Tool", input: {} };
  const id = call.toolCallId;
  // コアの MCP サーバーのツール（承認と断りはツールの中で行うもの・読むだけのものは聞かずに使わせる）
  const mcp = mcpToolOf(call, deps.tools.map((t) => t.name));
  if (mcp) {
    const endpoint = deps.tools.find((t) => t.name === mcp.server);
    if (endpoint?.autoAllow.includes(mcp.tool)) return { allow: true };
    return modeOutcome(deps, "command", shown.name, shown.input, id);
  }
  if (call.kind === "execute") {
    const command = commandOf(call);
    return (await guardOutcome(deps, await judgeCommand(deps.guard, command), "Bash", { command }, id)) ?? modeOutcome(deps, "command", "Bash", { command }, id);
  }
  if (call.kind && READ_KINDS.has(call.kind)) {
    for (const path of pathsOf(call)) {
      const guarded = await guardOutcome(deps, await judgeReadPath(deps.guard, path), shown.name, { file_path: path }, id);
      if (guarded && !guarded.allow) return guarded;
    }
    return { allow: true };
  }
  if (call.kind === "edit" || call.kind === "delete" || call.kind === "move") {
    const paths = pathsOf(call);
    // 変えるファイルが分からなければ通さない（守りを当てられないため）
    if (paths.length === 0) return { allow: false, reason: "変えるファイルが分からないため、Kickoff の守りを当てられませんでした" };
    let asked = false;
    for (const target of paths) {
      const guarded = await guardOutcome(deps, await judgeWritePath(deps.guard, target), "Write", { file_path: target }, id);
      if (guarded && !guarded.allow) return guarded;
      if (guarded) asked = true;
    }
    return asked ? { allow: true } : modeOutcome(deps, "edit", shown.name, shown.input, id);
  }
  // 種類の分からないツールは、コマンドと同じく権限モードに任せる
  return modeOutcome(deps, "command", shown.name, shown.input, id);
}

/** 権限の頼みへの答え（止めたら cancelled。断ったら理由を denied に渡す） */
export async function answerPermission(deps: PermissionDeps, request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
  if (deps.signal.aborted) return { outcome: { outcome: "cancelled" } };
  const outcome = await decide(deps, request.toolCall);
  if (deps.signal.aborted) return { outcome: { outcome: "cancelled" } };
  if (!outcome.allow && outcome.reason !== PLAN_MODE_DECLINED) deps.denied(`［Kickoff］${what(request.toolCall)}を断りました: ${outcome.reason}`);
  return optionFor(request, outcome);
}
