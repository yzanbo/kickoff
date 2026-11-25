import type { WebContents } from "electron";
import type { IpcHandlers } from "@/foundation/desktop/ipc/register";
import { createRendererLifetimeWatcher } from "@/foundation/desktop/app/rendererLifetime";

/**
 * この Mac の画面の内蔵ターミナル（パネルのタブ）の、画面の生き死にの見張り。シェルはコアで動き、画面はコアの API
 * （POST /api/terminals・GET /api/terminals/:key/ws。スマホと同じ WebSocket）で直接つなぐので、出力はメインプロセスを通らない。
 * 画面は持ち主の印（wc:<WebContents の ID>）を IPC の terminal.owner でもらってシェルに付け、その画面が消えた・読み込み直したら、
 * メインがコアにその持ち主のシェルを止めさせる（タブの記録は画面と一緒に消えるので、残すと止められなくなる）
 */

let closeOwned: (owner: string) => void = () => {};

/** 持ち主のシェルを止める口を渡す（index.ts がコアを起動したあと） */
export function setTerminalCloser(fn: (owner: string) => void) {
  closeOwned = fn;
}

/** 画面ごとの持ち主の印 */
const ownerOf = (wc: WebContents) => `wc:${wc.id}`;

const watchOwner = createRendererLifetimeWatcher((owner) => closeOwned(ownerOf(owner)));

/** 内蔵ターミナル（IPC の terminal）。持ち主の印を返し、その画面を見張り始める */
export const terminalHandlers: IpcHandlers["terminal"] = {
  owner: (e) => {
    watchOwner(e.sender);
    return ownerOf(e.sender);
  },
};
