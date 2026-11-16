// 1 回の実行で AI に出すツールの MCP サーバー（プロバイダーに依らない）。turn.ts がコアの MCP サーバー（host.ts）に登録し、各 CLI はその口につなぐ
import type { ProviderCallbacks, ProviderTurnParams } from "../providers/types.js";
import { browserToolServer } from "./browserTools.js";
import { chatToolServer } from "./chatTools.js";
import { dbToolServer } from "./dbTools.js";
import type { ToolServer } from "./tool.js";

/**
 * 実行に渡すツールの中身から、出す MCP サーバーを作る: 埋め込みブラウザ（デスクトップアプリのときだけ）・プロジェクトの DB（AI に見せる接続があるときだけ）・
 * チャットのツール（子チャットを作るのは設定で止めていない・世代の上限に達していないときだけ。家系のチャットの名前・固定・グループを変えるのはいつも）。
 * 承認はツールの中で cb.requestApproval で聞き、実行を止めたら signal で止める
 */
export function turnToolServers(params: ProviderTurnParams, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal): ToolServer[] {
  const chat = chatToolServer(
    {
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
    },
    cb,
    signal,
  );
  return [
    ...(params.browser ? [browserToolServer(params.browser.control, params.browser)] : []),
    ...(params.database ? [dbToolServer(params.database, cb, signal)] : []),
    ...(chat ? [chat] : []),
  ];
}
