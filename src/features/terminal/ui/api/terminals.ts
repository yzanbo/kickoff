import type { TerminalOpenBody, TerminalOpened, TerminalOwnerBody } from "@shared/terminal/types";
import { request, withQuery } from "@/foundation/ui/api/http";

/**
 * 内蔵ターミナル（コアの routes/terminals.ts）。この Mac の画面のタブもスマホと同じく、シェルを用意してから WebSocket でつなぐ
 * （出力はメインプロセスを通らない）
 */
export const terminalsApi = {
  /** タブのシェルを用意する（あればつなぎ直し = 名前と持ち主を覚え直すだけ。なければ cwd で始める） */
  openTerminal: (body: TerminalOpenBody) => request<TerminalOpened>("POST", "/api/terminals", body),
  /** シェルの持ち主だけを替える（タブを別ウィンドウへ移す・戻すとき。なければ 404 で、始めない） */
  setTerminalOwner: (key: string, body: TerminalOwnerBody) => request<void>("PUT", `/api/terminals/${encodeURIComponent(key)}/owner`, body),
  /** シェルを止める（タブを閉じたとき） */
  closeTerminal: (key: string) => request<void>("DELETE", `/api/terminals/${encodeURIComponent(key)}`),
};

/** シェルにつなぐ WebSocket の URL（いまの画面と同じ出どころ。開発時は Vite が /api をコアへ転送する） */
export function terminalSocketUrl(key: string, cols: number, rows: number): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${withQuery(`/api/terminals/${encodeURIComponent(key)}/ws`, { cols, rows })}`;
}
