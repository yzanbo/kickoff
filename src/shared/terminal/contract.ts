// 内蔵ターミナルの取り決め（受け口は src/features/terminal/core/routes/terminals.ts）。この Mac の画面のタブもスマホも、シェルを用意してから WebSocket でつなぐ。
// 端末に開くのは一覧・始める・止める・つなぐ（見るだけの端末は一覧と WebSocket で見るだけ）
import { empty, raw, route, ws, type Contract } from "@shared/foundation/contract";
import type { TerminalClientMessage, TerminalCreateBody, TerminalCreated, TerminalOwnerBody, TerminalServerMessage, TerminalTab } from "./types";

export const terminalContract = {
  /** 動いているシェルのタブ（project_id でそのプロジェクトのものだけ。番号でなければ 400） */
  "GET /api/terminals": route<never, TerminalTab[], { project_id?: number }>({ access: "device" }),
  /** 新しいシェルをプロジェクトの作業場所（本体・ワークツリー）で始める → キー（このキーで WebSocket につなぐ） */
  "POST /api/projects/:projectId/terminals": route<TerminalCreateBody, TerminalCreated>({ status: 201, access: "device" }),
  /**
   * この Mac の画面のタブのシェルを用意する（本文は TerminalOpenBody。あればつなぎ直して 200、なければ始めて 201。応答は TerminalOpened）。
   * 状態コードが中身で決まるので受け口が応答を作る。端末には開かない
   */
  "POST /api/terminals": raw(),
  /** この Mac の画面のタブのシェルの持ち主だけを替える（なければ 404 で、始めない） */
  "PUT /api/terminals/:key/owner": empty<TerminalOwnerBody>(),
  /** シェルを止める（端末は自分が作ったものだけ） */
  "DELETE /api/terminals/:key": empty({ access: "device" }),
  /** つなぐ（最初にいまの画面の内容 snapshot、そのあと出力 data・終わり exit） */
  "GET /api/terminals/:key/ws": ws<TerminalClientMessage, TerminalServerMessage>({ access: "device" }),
} as const satisfies Contract;
