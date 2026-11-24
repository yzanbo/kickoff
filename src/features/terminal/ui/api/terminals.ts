import type { TerminalOpenBody, TerminalOpened, TerminalOwnerBody } from "@shared/terminal/types";
import { terminalContract } from "@shared/terminal/contract";
import { client } from "@/foundation/ui/api/client";
import { request } from "@/foundation/ui/api/http";

/** 内蔵ターミナルの呼び手（取り決めは @shared/terminal/contract.ts）。この Mac の画面のタブもスマホと同じく、シェルを用意してから WebSocket でつなぐ（出力はメインプロセスを通らない） */
const terminals = client(terminalContract);

export const terminalsApi = {
  /** タブのシェルを用意する（あればつなぎ直し = 名前と持ち主を覚え直すだけ。なければ cwd で始める。状態コードが中身で決まる raw のルートなので request で送る） */
  openTerminal: (body: TerminalOpenBody) => request<TerminalOpened>("POST", terminals.url("POST /api/terminals"), body),
  /** シェルの持ち主だけを替える（タブを別ウィンドウへ移す・戻すとき。なければ 404 で、始めない） */
  setTerminalOwner: (key: string, body: TerminalOwnerBody) => terminals("PUT /api/terminals/:key/owner", { params: { key }, body }),
  /** シェルを止める（タブを閉じたとき） */
  closeTerminal: (key: string) => terminals("DELETE /api/terminals/:key", { params: { key } }),
};

/** シェルにつなぐ WebSocket の URL（いまの画面と同じ出どころ。開発時は Vite が /api をコアへ転送する） */
export function terminalSocketUrl(key: string): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${terminals.url("GET /api/terminals/:key/ws", { params: { key } })}`;
}
