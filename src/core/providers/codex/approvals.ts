import type { ApprovalDecision as KickoffDecision } from "@shared/types";
import { deniedWithWords, judgeCommand, judgeWritePath, type GuardContext, type GuardVerdict } from "../../chat/guard/judgeTool.js";
import type { ApprovalRequest, ProviderCallbacks, ProviderTurnParams } from "../types.js";
import { changeAsTool } from "./items.js";
import type {
  ApprovalDecision,
  CommandApprovalParams,
  ElicitationParams,
  FileChangeApprovalParams,
  FileUpdateChange,
  PermissionsApprovalParams,
  ThreadItem,
  UserInputParams,
} from "./protocol.js";

/**
 * Codex の app-server からの頼み（承認・質問）に答える（メモの仕様書「0021」の Q3 と「作りながら決める」の承認の決まり）。
 * Codex にはいつも untrusted で聞かせ、聞かれたコマンド・書く先に Kickoff の守り（chat/guard/judgeTool.ts）を当てる:
 * 断る守り → decline / 聞く守り（Docker・作業場所の外）→ 権限モードによらず承認カード / 何もなし → 権限モード（Auto mode = 通す・
 * 編集を自動承認 = ファイルの変更だけ通す・毎回確認 = 聞く・計画 = 変更を断る）。
 * Codex の承認の答えには理由を渡す欄がないので、断った理由は turn/steer でいまの作業に伝える（steer）
 */

export interface ApprovalDeps {
  params: ProviderTurnParams;
  guard: GuardContext;
  cb: Pick<ProviderCallbacks, "requestApproval">;
  signal: AbortSignal;
  /** 始まった項目（ファイルの変更の承認は項目の ID だけで来るので、変えるファイルをここから引く） */
  items: Map<string, ThreadItem>;
  /** 断った理由をいまの作業に伝える */
  steer(text: string): void;
}

/** 計画モードで変更を断るときの文 */
export const PLAN_MODE_DECLINED = "計画モードなので、ファイルの変更・コマンドの実行はしません。計画だけを書いてください";

const declinedNote = (what: string, reason: string) => `［Kickoff］${what}を断りました: ${reason}`;

/** 承認カードを出して答えを待つ（止めたら断ったことにする） */
async function ask(deps: ApprovalDeps, request: ApprovalRequest): Promise<KickoffDecision> {
  return deps.cb.requestApproval(request, deps.signal).catch((): KickoffDecision => ({ action: "deny", message: "" }));
}

const allowed = (d: KickoffDecision) => d.action === "allow" || d.action === "allow_always";
const wordsOf = (d: KickoffDecision) => (d.action === "deny" ? d.message || undefined : undefined);

/** 守りが聞くと言ったときのカード（断られたら理由を伝える）。「このチャットでは許可」なら書く先を覚える */
async function askGuard(deps: ApprovalDeps, verdict: Extract<GuardVerdict, { kind: "ask" }>, toolName: string, input: Record<string, unknown>, itemId: string, what: string): Promise<boolean> {
  const remember = verdict.rememberTarget !== undefined;
  const decision = await ask(deps, {
    kind: "permission",
    toolName,
    input,
    title: verdict.title,
    description: verdict.description,
    canRemember: remember,
    ...(remember ? { rememberScope: "chat" as const } : {}),
    toolUseId: itemId,
  });
  if (decision.action === "allow_always" && verdict.rememberTarget) deps.params.writeScope?.allowed.add(verdict.rememberTarget);
  if (allowed(decision)) return true;
  deps.steer(declinedNote(what, deniedWithWords(verdict.deniedReason, wordsOf(decision))));
  return false;
}

/** 守りが何も言わなかったときの、権限モードによる答え（kind: command = コマンド / edit = ファイルの変更） */
async function byMode(deps: ApprovalDeps, kind: "command" | "edit", toolName: string, input: Record<string, unknown>, itemId: string, what: string, reason: string | null | undefined): Promise<ApprovalDecision> {
  const mode = deps.params.permissionMode;
  if (mode === "plan") {
    deps.steer(declinedNote(what, PLAN_MODE_DECLINED));
    return "decline";
  }
  if (mode === "auto" || (mode === "acceptEdits" && kind === "edit")) return "accept";
  const decision = await ask(deps, { kind: "permission", toolName, input, ...(reason ? { description: reason } : {}), canRemember: true, toolUseId: itemId });
  if (decision.action === "allow_always") return "acceptForSession";
  if (decision.action === "allow") return "accept";
  const words = wordsOf(decision);
  deps.steer(declinedNote(what, words ? `利用者が拒否しました（利用者の言葉: ${words}）` : "利用者が拒否しました"));
  return "decline";
}

async function commandApproval(deps: ApprovalDeps, p: CommandApprovalParams): Promise<{ decision: ApprovalDecision }> {
  const command = p.command ?? "";
  const input = { command };
  const verdict = await judgeCommand(deps.guard, command);
  const what = `コマンド「${command.slice(0, 200)}」`;
  if (verdict.kind === "deny") {
    deps.steer(declinedNote(what, verdict.reason));
    return { decision: "decline" };
  }
  if (verdict.kind === "ask") return { decision: (await askGuard(deps, verdict, "Bash", input, p.itemId, what)) ? "accept" : "decline" };
  return { decision: await byMode(deps, "command", "Bash", input, p.itemId, what, p.reason) };
}

async function fileChangeApproval(deps: ApprovalDeps, p: FileChangeApprovalParams): Promise<{ decision: ApprovalDecision }> {
  const item = deps.items.get(p.itemId);
  const changes: FileUpdateChange[] = item?.type === "fileChange" ? (item as Extract<ThreadItem, { type: "fileChange" }>).changes : [];
  const paths = [...changes.flatMap((c) => [c.path, ...(c.kind.type === "update" && c.kind.move_path ? [c.kind.move_path] : [])]), ...(p.grantRoot ? [p.grantRoot] : [])];
  const what = `ファイルの変更（${paths.slice(0, 3).join("・") || "不明"}）`;
  // 変えるファイルが分からなければ通さない（守りを当てられないため）
  if (paths.length === 0) {
    deps.steer(declinedNote(what, "変えるファイルが分からないため、Kickoff の守りを当てられませんでした"));
    return { decision: "decline" };
  }
  let asked = false;
  for (const target of paths) {
    const verdict = await judgeWritePath(deps.guard, target);
    if (verdict.kind === "deny") {
      deps.steer(declinedNote(what, verdict.reason));
      return { decision: "decline" };
    }
    if (verdict.kind === "ask") {
      if (!(await askGuard(deps, verdict, "Write", { file_path: target }, p.itemId, what))) return { decision: "decline" };
      asked = true;
    }
  }
  if (asked) return { decision: "accept" };
  const shown = changes[0] ? changeAsTool(changes[0]) : { name: "Write", input: { file_path: paths[0] } };
  return { decision: await byMode(deps, "edit", shown.name, { ...shown.input, ...(changes.length > 1 ? { files: changes.map((c) => c.path) } : {}) }, p.itemId, what, p.reason) };
}

/** 追加の権限（書けるフォルダ・ネットワーク）。書く先には書き込みの守りを当て、ネットワークは絞らないので通す */
async function permissionsApproval(deps: ApprovalDeps, p: PermissionsApprovalParams): Promise<unknown> {
  const writes = p.permissions.fileSystem?.write ?? [];
  const what = `書けるフォルダの追加（${writes.join("・")}）`;
  for (const target of writes) {
    const verdict = await judgeWritePath(deps.guard, target);
    if (verdict.kind === "deny") {
      deps.steer(declinedNote(what, verdict.reason));
      return { permissions: {}, scope: "turn" };
    }
    if (verdict.kind === "ask" && !(await askGuard(deps, verdict, "Write", { file_path: target }, p.itemId, what))) return { permissions: {}, scope: "turn" };
  }
  const granted = { ...(p.permissions.network ? { network: p.permissions.network } : {}), ...(p.permissions.fileSystem ? { fileSystem: p.permissions.fileSystem } : {}) };
  if (writes.length > 0 && deps.params.permissionMode !== "auto") {
    const decision = await ask(deps, { kind: "permission", toolName: "Write", input: { file_path: writes[0], folders: writes }, description: p.reason ?? what, canRemember: false, toolUseId: p.itemId });
    if (!allowed(decision)) return { permissions: {}, scope: "turn" };
  }
  return { permissions: granted, scope: "turn" };
}

/** AI からの質問（Kickoff の質問カードの形 = AskUserQuestion に写し、答えを質問の ID ごとに返す） */
async function userInput(deps: ApprovalDeps, p: UserInputParams): Promise<unknown> {
  const questions = p.questions.map((q) => ({ question: q.question, header: q.header, options: (q.options ?? []).map((o) => ({ label: o.label, description: o.description })), multiSelect: false }));
  const decision = await ask(deps, { kind: "question", toolName: "AskUserQuestion", input: { questions }, canRemember: false, toolUseId: p.itemId });
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
  const decision = await ask(deps, { kind: "permission", toolName: `mcp__${p.serverName}`, input: { message: p.message }, title: p.message, canRemember: false });
  return allowed(decision) ? { action: "accept", content: {}, _meta: null } : { action: "decline", content: null, _meta: null };
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
