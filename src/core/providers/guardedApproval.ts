import type { ApprovalDecision } from "@shared/types";
import { deniedWithWords, type GuardVerdict } from "../chat/guard/judgeTool.js";
import type { ApprovalRequest, ProviderCallbacks, ProviderTurnParams } from "./types.js";

/**
 * フックを持たず、承認の頼みで聞いてくる CLI（Codex の app-server・Copilot SDK・ACP）に共通の承認の決まり（メモの仕様書「0021」の Q3 と
 * 「作りながら決める」の承認の決まり）。守り（chat/guard/judgeTool.ts）の判定と権限モードから「通す / 断る（AI に伝える理由）」を決める。
 * 断った理由の AI への渡し方は CLI ごと（Codex は turn/steer、Copilot は reject の feedback）
 */

export interface ApprovalContext {
  params: Pick<ProviderTurnParams, "permissionMode" | "writeScope">;
  cb: Pick<ProviderCallbacks, "requestApproval">;
  signal: AbortSignal;
}

/** 承認の結果: 通す（このセッションの間は覚えるか）/ 断る（AI に伝える理由） */
export type ApprovalOutcome = { allow: true; forSession?: boolean } | { allow: false; reason: string };

/** 計画モードで変更を断るときの文 */
export const PLAN_MODE_DECLINED = "計画モードなので、ファイルの変更・コマンドの実行はしません。計画だけを書いてください";

/** 利用者が承認カードで断ったときの文 */
export const userDenied = (words: string | undefined) => (words ? `利用者が拒否しました（利用者の言葉: ${words}）` : "利用者が拒否しました");

/** 承認カードを出して答えを待つ（止めたら断ったことにする） */
export function askApproval(ctx: ApprovalContext, request: ApprovalRequest): Promise<ApprovalDecision> {
  return ctx.cb.requestApproval(request, ctx.signal).catch((): ApprovalDecision => ({ action: "deny", message: "" }));
}

export const isAllowed = (d: ApprovalDecision) => d.action === "allow" || d.action === "allow_always";
export const wordsOf = (d: ApprovalDecision) => (d.action === "deny" ? d.message || undefined : undefined);

/** 守りが聞くと言ったときのカード（権限モードによらず聞く）。「このチャットでは許可」なら書く先を覚える */
export async function guardAskOutcome(
  ctx: ApprovalContext,
  verdict: Extract<GuardVerdict, { kind: "ask" }>,
  toolName: string,
  input: Record<string, unknown>,
  toolUseId: string | undefined,
): Promise<ApprovalOutcome> {
  const remember = verdict.rememberTarget !== undefined;
  const decision = await askApproval(ctx, {
    kind: "permission",
    toolName,
    input,
    title: verdict.title,
    description: verdict.description,
    canRemember: remember,
    ...(remember ? { rememberScope: "chat" as const } : {}),
    ...(toolUseId ? { toolUseId } : {}),
  });
  if (decision.action === "allow_always" && verdict.rememberTarget) ctx.params.writeScope?.allowed.add(verdict.rememberTarget);
  if (isAllowed(decision)) return { allow: true };
  return { allow: false, reason: deniedWithWords(verdict.deniedReason, wordsOf(decision)) };
}

/** 守りの判定のうち、権限モードに任せない分（断る・聞く）。何も言わなければ null */
export async function guardOutcome(ctx: ApprovalContext, verdict: GuardVerdict, toolName: string, input: Record<string, unknown>, toolUseId: string | undefined): Promise<ApprovalOutcome | null> {
  if (verdict.kind === "deny") return { allow: false, reason: verdict.reason };
  if (verdict.kind === "ask") return guardAskOutcome(ctx, verdict, toolName, input, toolUseId);
  return null;
}

/**
 * 守りが何も言わなかったときの、権限モードによる答え（kind: command = コマンド / edit = ファイルの変更）:
 * Auto mode = 通す・編集を自動承認 = ファイルの変更だけ通す・毎回確認 = 聞く（「常に許可」はこのセッションの間）・計画 = 断る
 */
export async function modeOutcome(
  ctx: ApprovalContext,
  kind: "command" | "edit",
  toolName: string,
  input: Record<string, unknown>,
  toolUseId: string | undefined,
  description?: string | null,
): Promise<ApprovalOutcome> {
  const mode = ctx.params.permissionMode;
  if (mode === "plan") return { allow: false, reason: PLAN_MODE_DECLINED };
  if (mode === "auto" || (mode === "acceptEdits" && kind === "edit")) return { allow: true };
  const decision = await askApproval(ctx, { kind: "permission", toolName, input, ...(description ? { description } : {}), canRemember: true, ...(toolUseId ? { toolUseId } : {}) });
  if (decision.action === "allow_always") return { allow: true, forSession: true };
  if (decision.action === "allow") return { allow: true };
  return { allow: false, reason: userDenied(wordsOf(decision)) };
}
