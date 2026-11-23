// プロバイダーの確かめの共通の部品: 実行の指定 turnParams・AI の操作ツールの口 chatToolEndpoint・知らせを覚えるコールバック recorder。
// どのプロバイダーのテストも同じものを使う（写しを置かない）。テストからだけ使う
import type { ApprovalReply } from "@shared/ai/approvals";
import type { ApiRetryInfo } from "@shared/ai/turnEvents";
import { permissionOnlyGate } from "@/features/ai/core/permissionMode";
import type { ToolEndpoint } from "@/foundation/core/aiTools/host";
import type { ApprovalRequest, ProviderCallbacks, ProviderTurnParams, TurnControl } from "@/features/ai/core/providers/types";

/** 実行の指定（どのプロバイダーの確かめにも使える最小の形。patch で足す・替える） */
export function turnParams(patch: Partial<ProviderTurnParams> = {}): ProviderTurnParams {
  return {
    cwd: "/w",
    prompt: "やって",
    promptId: "u-1",
    compact: false,
    systemPrompt: "Kickoff の文脈",
    resumeSessionId: null,
    model: null,
    effort: null,
    permissionMode: "default",
    fastMode: false,
    autoCompactPct: null,
    additionalDirectories: [],
    sandbox: null,
    sandboxOff: false,
    gate: permissionOnlyGate({ permissionMode: patch.permissionMode ?? "default", cb: { requestApproval: async () => ({ action: "deny", message: "" }) }, signal: new AbortController().signal }),
    ...patch,
  };
}

/** AI の操作ツール kickoff_chat の口（鍵 secret-key の見出し付き。鍵が引数・環境変数に出ないことを確かめる） */
export const chatToolEndpoint = (autoAllow: string[] = []): ToolEndpoint => ({ name: "kickoff_chat", url: "http://127.0.0.1:9/mcp/kickoff_chat", headers: { Authorization: "Bearer secret-key" }, autoAllow });

/** 知らせを覚え、承認には answer で答えるコールバック */
export function recorder(answer: (req: ApprovalRequest) => ApprovalReply = () => ({ action: "allow" })) {
  // 知らせの形はプロバイダーごとの確かめで欄を読む（どの種類かは各テストが見分ける）
  const events: any[] = [];
  const approvals: ApprovalRequest[] = [];
  const streamed: string[] = [];
  const contexts: number[] = [];
  const retries: (ApiRetryInfo | null)[] = [];
  let control: TurnControl | null = null;
  const cb: ProviderCallbacks = {
    emit: (e) => events.push(e),
    stream: (t) => streamed.push(t),
    requestApproval: async (req) => {
      approvals.push(req);
      return answer(req);
    },
    context: (tokens) => contexts.push(tokens),
    retry: (info) => retries.push(info),
    control: (c) => {
      control = c;
    },
  };
  return { cb, events, approvals, streamed, contexts, retries, control: () => control };
}
