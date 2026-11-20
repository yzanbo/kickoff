// 1 回の実行で AI に出すツール（プロバイダーに依らない）。組をレジストリでサーバーの形にし、turn.ts がコアの MCP サーバー（host.ts）に登録して、各 CLI はその口につなぐ
import type { ProviderCallbacks, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { browserToolGroup } from "@/features/browser/core/browserTools";
import { CHAT_TOOLS_HEAD, chatToolGroups } from "./chatTools";
import { dbToolGroup } from "@/features/database/core/dbTools";
import { AiToolRegistry } from "@/foundation/core/aiTools/registry";
import type { ToolServer } from "@/foundation/core/aiTools/tool";
import type { Chat } from "@shared/chat/types";
import { aiTurnOf } from "./aiTurn";

/**
 * 実行に渡すツールの中身から、出す MCP サーバーを作る: 埋め込みブラウザ（デスクトップアプリのときだけ）・プロジェクトの DB（AI に見せる接続があるときだけ）・
 * チャットのツール（子チャットを作るのは設定で止めていない・世代の上限に達していないときだけ。家系のチャットの名前・固定・グループを変えるのはいつも）。
 * 承認はツールの中で実行の requestApproval で聞き、実行を止めたら signal で止める
 */
export function turnToolServers(
  params: ProviderTurnParams,
  { chat, workdir, callbacks, signal }: { chat: Chat; workdir: string; callbacks: Pick<ProviderCallbacks, "requestApproval">; signal: AbortSignal },
): ToolServer[] {
  const registry = new AiToolRegistry([
    ...(params.browser ? [browserToolGroup(params.browser.control)] : []),
    ...(params.database ? [dbToolGroup(params.database)] : []),
    ...chatToolGroups({
      diagnostics: params.sandboxDiagnostics ?? null,
      createChat: params.createChat ?? null,
      chatEdit: params.chatEdit ?? null,
      open: params.open ?? null,
      read: params.chatRead ?? null,
      project: params.chatProject ?? null,
      terminal: params.chatTerminal ?? null,
      visual: params.chatVisual ?? null,
      worktree: params.chatWorktree ?? null,
      notify: params.chatNotify ?? null,
      userView: params.chatUserView ?? null,
      remove: params.chatRemove ?? null,
      workplace: params.chatWorkplace ?? null,
    }),
  ]);
  return registry.serversFor(aiTurnOf(chat, workdir, callbacks.requestApproval, signal), { kickoff_chat: CHAT_TOOLS_HEAD });
}
