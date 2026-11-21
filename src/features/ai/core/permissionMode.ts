// 権限モードの答えと承認カードの聞き方（承認を聞いてくる CLI に共通。守りの判定は guard の門 gate.ts、ここは守りが何も言わなかったときと、守りのない門）
import type { PermissionMode } from "@shared/settings/types";
import type { ApprovalReply } from "@shared/ai/approvals";
import type { ApprovalRequest, GateAsk, GateCall, GateOutcome, ProviderCallbacks, ToolGate } from "./providers/types";

/** 承認カードを出す口と、止める合図 */
export interface ApprovalContext {
  cb: Pick<ProviderCallbacks, "requestApproval">;
  signal: AbortSignal;
}

/** 計画モードで変更を断るときの文 */
export const PLAN_MODE_DECLINED = "計画モードなので、ファイルの変更・コマンドの実行はしません。計画だけを書いてください";

/** 利用者が承認カードで断ったときの文 */
const userDenied = (words: string | undefined) => (words ? `利用者が拒否しました（利用者の言葉: ${words}）` : "利用者が拒否しました");

/** 承認カードを出して答えを待つ（止めたら断ったことにする） */
export function askApproval(ctx: ApprovalContext, request: ApprovalRequest): Promise<ApprovalReply> {
  return ctx.cb.requestApproval(request, ctx.signal).catch((): ApprovalReply => ({ action: "deny", message: "" }));
}

export const isAllowed = (d: ApprovalReply) => d.action === "allow" || d.action === "allow_always";
/** 断ったときの利用者の言葉（なければ undefined） */
export const wordsOf = (d: ApprovalReply) => (d.action === "deny" ? d.message || undefined : undefined);

/** 断ったことを AI に伝える文（Codex は turn/steer、Copilot は reject の feedback、ACP は次の指示で渡す） */
export const declinedNote = (what: string, reason: string) => `［Kickoff］${what}を断りました: ${reason}`;

/**
 * 守りが何も言わなかったときの、権限モードによる答え（kind: command = コマンド / edit = ファイルの変更）:
 * Auto mode = 通す・編集を自動承認 = ファイルの変更だけ通す・毎回確認 = 聞く（「常に許可」はこのセッションの間）・計画 = 断る
 */
export async function modeVerdict(ctx: ApprovalContext & { permissionMode: PermissionMode }, kind: "command" | "edit", call: GateCall, ask: GateAsk = {}): Promise<GateOutcome> {
  const mode = ctx.permissionMode;
  if (mode === "plan") return { allow: false, reason: PLAN_MODE_DECLINED };
  if (mode === "auto" || (mode === "acceptEdits" && kind === "edit")) return { allow: true };
  const decision = await askApproval(ctx, {
    kind: "permission",
    toolName: call.name,
    input: call.input,
    ...(ask.description ? { description: ask.description } : {}),
    canRemember: true,
    ...(ask.toolUseId ? { toolUseId: ask.toolUseId } : {}),
  });
  if (decision.action === "allow_always") return { allow: true, forSession: true };
  if (decision.action === "allow") return { allow: true };
  return { allow: false, reason: userDenied(wordsOf(decision)) };
}

/** 守りのない門（権限モードだけで答える。テストと、守りの口のない実行） */
export function permissionOnlyGate(ctx: ApprovalContext & { permissionMode: PermissionMode }): ToolGate {
  return {
    guard: async () => null,
    deny: async () => null,
    guardWrites: async () => null,
    guardRead: async () => null,
    byMode: (kind, call, ask) => modeVerdict(ctx, kind, call, ask),
    allowedCommands: [],
    note: declinedNote,
  };
}
