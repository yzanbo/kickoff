import { askApproval, isAllowed, PLAN_MODE_DECLINED } from "@/features/ai/core/permissionMode";
import type { GateOutcome, ProviderCallbacks, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { changeAsTool } from "./items";
import { writeKey } from "./preToolUse";
import { isUnsandboxedCommand, SANDBOX_EXIT_DECLINED } from "./sandboxExit";
import type {
  ApprovalDecision,
  CommandApprovalParams,
  ElicitationParams,
  FileChangeApprovalParams,
  FileUpdateChange,
  PermissionsApprovalParams,
  ThreadItem,
  UserInputParams,
} from "./protocol";

/**
 * Codex の app-server からの頼み（承認・質問）に答える。
 * 承認の決まりは on-request（ふだんのコマンド・ファイルの変更は Codex の砂場の中で聞かずに流れ、守りと権限モードは PreToolUse のフック = preToolUse.ts で当てる）。
 * ここに来るのは砂場から出る頼みだけ: コマンドを砂場の外で流す → 決まったコマンド（Bash の砂場の unsandboxedCommands）だけ通し、ほかは断る /
 * 書ける場所の外へのファイルの変更 → 守りの門（params.gate）と権限モード（フックで許した書く先は聞き直さない）。
 * Codex の承認の答えには理由を渡す欄がないので、断った理由は turn/steer でいまの作業に伝える（steer）
 */

export interface ApprovalDeps {
  params: ProviderTurnParams;
  cb: Pick<ProviderCallbacks, "requestApproval">;
  signal: AbortSignal;
  /** 始まった項目（ファイルの変更の承認は項目の ID だけで来るので、変えるファイルをここから引く） */
  items: Map<string, ThreadItem>;
  /** 断った理由をいまの作業に伝える */
  steer(text: string): void;
  /** フックで利用者が許した書く先（実体のパス。preToolUse.ts） */
  approvedWrites: Set<string>;
}

/** 門の答えを Codex の答えにする（断ったら理由を turn/steer で伝える） */
function toDecision(deps: ApprovalDeps, outcome: GateOutcome, what: string): ApprovalDecision {
  if (outcome.allow) return outcome.forSession ? "acceptForSession" : "accept";
  deps.steer(deps.params.gate.note(what, outcome.reason));
  return "decline";
}

/**
 * コマンドの承認の頼み = 砂場の外で流したい（on-request）。断る守りはここでも当て、計画モードは断る。
 * Bash の砂場をかけている実行では、決まったコマンドだけ通す（守り・権限モードはフックで当て済み）。砂場をかけていなければ、守りと権限モードで決める
 */
async function commandApproval(deps: ApprovalDeps, p: CommandApprovalParams): Promise<{ decision: ApprovalDecision }> {
  const command = p.command ?? "";
  const call = { name: "Bash", input: { command } };
  const what = `コマンド「${command.slice(0, 200)}」`;
  const { gate } = deps.params;
  const denied = await gate.deny(call);
  if (denied) return { decision: toDecision(deps, denied, what) };
  if (deps.params.permissionMode === "plan") return { decision: toDecision(deps, { allow: false, reason: PLAN_MODE_DECLINED }, what) };
  const sandbox = deps.params.bashSandbox;
  if (sandbox) {
    const allowed = isUnsandboxedCommand(command, sandbox.unsandboxedCommands);
    return { decision: toDecision(deps, allowed ? { allow: true } : { allow: false, reason: SANDBOX_EXIT_DECLINED }, what) };
  }
  const guarded = await gate.guard(call, { toolUseId: p.itemId });
  return { decision: toDecision(deps, guarded ?? (await gate.byMode("command", call, { toolUseId: p.itemId, description: p.reason })), what) };
}

async function fileChangeApproval(deps: ApprovalDeps, p: FileChangeApprovalParams): Promise<{ decision: ApprovalDecision }> {
  const item = deps.items.get(p.itemId);
  const changes: FileUpdateChange[] = item?.type === "fileChange" ? (item as Extract<ThreadItem, { type: "fileChange" }>).changes : [];
  const paths = [...changes.flatMap((c) => [c.path, ...(c.kind.type === "update" && c.kind.move_path ? [c.kind.move_path] : [])]), ...(p.grantRoot ? [p.grantRoot] : [])];
  const what = `ファイルの変更（${paths.slice(0, 3).join("・") || "不明"}）`;
  // 変えるファイルが分からなければ通さない（守りを当てられないため）
  if (paths.length === 0) {
    deps.steer(deps.params.gate.note(what, "変えるファイルが分からないため、Kickoff の守りを当てられませんでした"));
    return { decision: "decline" };
  }
  // フックで利用者が許した書く先だけなら聞き直さない
  if (paths.every((target) => deps.approvedWrites.has(writeKey(deps.params.cwd, target)))) return { decision: "accept" };
  const guarded = await deps.params.gate.guardWrites(paths, { toolUseId: p.itemId });
  if (guarded && !guarded.allow) return { decision: toDecision(deps, guarded, what) };
  if (guarded) return { decision: "accept" };
  const shown = changes[0] ? changeAsTool(changes[0]) : { name: "Write", input: { file_path: paths[0] } };
  const input = { ...shown.input, ...(changes.length > 1 ? { files: changes.map((c) => c.path) } : {}) };
  return { decision: toDecision(deps, await deps.params.gate.byMode("edit", { name: shown.name, input }, { toolUseId: p.itemId, description: p.reason }), what) };
}

/** 追加の権限（書けるフォルダ・ネットワーク）。書く先には書き込みの守りを当て、ネットワークは絞らないので通す */
async function permissionsApproval(deps: ApprovalDeps, p: PermissionsApprovalParams): Promise<unknown> {
  const writes = p.permissions.fileSystem?.write ?? [];
  const what = `書けるフォルダの追加（${writes.join("・")}）`;
  const guarded = await deps.params.gate.guardWrites(writes, { toolUseId: p.itemId });
  if (guarded && !guarded.allow) {
    toDecision(deps, guarded, what);
    return { permissions: {}, scope: "turn" };
  }
  const granted = { ...(p.permissions.network ? { network: p.permissions.network } : {}), ...(p.permissions.fileSystem ? { fileSystem: p.permissions.fileSystem } : {}) };
  if (writes.length > 0 && deps.params.permissionMode !== "auto") {
    const decision = await askApproval(deps, { kind: "permission", toolName: "Write", input: { file_path: writes[0], folders: writes }, description: p.reason ?? what, canRemember: false, toolUseId: p.itemId });
    if (!isAllowed(decision)) return { permissions: {}, scope: "turn" };
  }
  return { permissions: granted, scope: "turn" };
}

/** AI からの質問（Kickoff の質問カードの形 = AskUserQuestion に写し、答えを質問の ID ごとに返す） */
async function userInput(deps: ApprovalDeps, p: UserInputParams): Promise<unknown> {
  const questions = p.questions.map((q) => ({ question: q.question, header: q.header, options: (q.options ?? []).map((o) => ({ label: o.label, description: o.description })), multiSelect: false }));
  const decision = await askApproval(deps, { kind: "question", toolName: "AskUserQuestion", input: { questions }, canRemember: false, toolUseId: p.itemId });
  if (decision.action !== "answer") return { answers: {} };
  const answers = Object.fromEntries(
    p.questions.map((q) => {
      const answer = decision.answers[q.question];
      return [q.id, { answers: answer === undefined ? [] : Array.isArray(answer) ? answer : [answer] }];
    }),
  );
  return { answers };
}

/** MCP サーバーからの確かめ（ツールの承認など）。Auto mode なら通し、ほかは承認カードで聞く */
async function elicitation(deps: ApprovalDeps, p: ElicitationParams): Promise<unknown> {
  if (p.mode === "url") return { action: "decline", content: null, _meta: null };
  if (deps.params.permissionMode === "auto") return { action: "accept", content: {}, _meta: null };
  const decision = await askApproval(deps, { kind: "permission", toolName: `mcp__${p.serverName}`, input: { message: p.message }, title: p.message, canRemember: false });
  return isAllowed(decision) ? { action: "accept", content: {}, _meta: null } : { action: "decline", content: null, _meta: null };
}

/** サーバーからの頼みに答える口（rpc.ts の ServerRequestHandler。知らない頼みは断る） */
export function createApprovalHandler(deps: ApprovalDeps): (method: string, params: unknown) => Promise<unknown> {
  return async (method, params) => {
    switch (method) {
      case "item/commandExecution/requestApproval":
        return commandApproval(deps, params as CommandApprovalParams);
      case "item/fileChange/requestApproval":
        return fileChangeApproval(deps, params as FileChangeApprovalParams);
      case "item/permissions/requestApproval":
        return permissionsApproval(deps, params as PermissionsApprovalParams);
      case "item/tool/requestUserInput":
        return userInput(deps, params as UserInputParams);
      case "mcpServer/elicitation/request":
        return elicitation(deps, params as ElicitationParams);
      // 古い形の承認（v1）は使わない設定なので来ないはず。来たら断る
      case "applyPatchApproval":
      case "execCommandApproval":
        return { decision: "denied" };
      default:
        // Kickoff が持たない頼み（ChatGPT のトークンの更新・動的なツールなど）は断る
        throw new Error(`Kickoff は ${method} に対応していません`);
    }
  };
}
