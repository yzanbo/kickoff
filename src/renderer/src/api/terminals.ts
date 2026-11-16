import type { TerminalOpenBody, TerminalOpened } from "@shared/types";
import { request, withQuery } from "./http";

/**
 * 内蔵ターミナル（コアの routes/terminals.ts）。この Mac の画面のタブもスマホと同じく、シェルを用意してから WebSocket でつなぐ
 * （出力はメインプロセスを通らない。メモの仕様書「0023_表示を軽くする」の案 16）
 */
export const terminalsApi = {
  /** タブのシェルを用意する（あればつなぎ直し = 名前と持ち主を覚え直すだけ。なければ cwd で始める） */
  openTerminal: (body: TerminalOpenBody) => request<TerminalOpened>("POST", "/api/terminals", body),
  /** シェルを止める（タブを閉じたとき） */
  closeTerminal: (key: string) => request<void>("DELETE", `/api/terminals/${encodeURIComponent(key)}`),
};

/** シェルにつなぐ WebSocket の URL（いまの画面と同じ出どころ。開発時は Vite が /api をコアへ転送する） */
export function terminalSocketUrl(key: string, cols: number, rows: number): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${withQuery(`/api/terminals/${encodeURIComponent(key)}/ws`, { cols, rows })}`;
}
