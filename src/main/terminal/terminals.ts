import type { WebContents } from "electron";
import type { TerminalSessions } from "../../core/terminal/sessions.js";
import { sendEvent, type IpcHandlers } from "../ipc/register.js";

/**
 * この Mac の画面の内蔵ターミナル（パネルのタブ）を、コアのシェル（core/terminal/sessions.ts）に IPC でつなぐ。
 * シェルはコアで動き、スマホからも WebSocket で同じシェルにつなげる（core/http/routes/terminals.ts）。
 * 画面の部品はボードを切り替えるたびに作り直されるので、シェルはキーごとに動かし続け、つなぎ直したらいまの画面の内容を返す。
 * その画面が消えた・読み込み直したら、その画面が持ち主のシェルを止める（タブの記録は画面と一緒に消えるので、残すと止められなくなる）
 */

let sessions: TerminalSessions | null = null;

/** コアのシェルを渡す（index.ts がコアを起動したあと） */
export function setTerminalSessions(s: TerminalSessions) {
  sessions = s;
}

/** 画面ごとの印（持ち主・つないでいる人の ID） */
const ownerOf = (wc: WebContents) => `wc:${wc.id}`;

/** その画面が消えた・読み込み直したときの片付け */
function closeOwnedBy(wc: WebContents) {
  sessions?.detachEverywhere(ownerOf(wc));
  sessions?.closeOwnedBy(ownerOf(wc));
}

const watched = new WeakSet<WebContents>();
function watchOwner(owner: WebContents) {
  if (watched.has(owner)) return;
  watched.add(owner);
  owner.on("destroyed", () => closeOwnedBy(owner));
  owner.on("render-process-gone", () => closeOwnedBy(owner));
  owner.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) closeOwnedBy(owner);
  });
}

const requireSessions = (): TerminalSessions => {
  if (!sessions) throw new Error("ターミナルの準備ができていません");
  return sessions;
};

/** 内蔵ターミナル（IPC の terminal）。引数の形は登録の補助（ipc/register.ts）が確かめてから渡す */
export const terminalHandlers: IpcHandlers["terminal"] = {
  /**
   * タブを表示したとき: そのキーのシェルがあれば、いまの画面の内容を返す（つなぎ直す。start は使わず、流し直さない）。なければ cwd で新しく始める。
   * 画面は返事が届くまでの出力を捨てるので、まだ送っていない出力は snapshot に入れて返す。つないだ画面が持ち主になる
   */
  open: (e, key, cwd, cols, rows, start, meta) => {
    const owner = e.sender;
    watchOwner(owner);
    const client = {
      id: ownerOf(owner),
      data: (data: string) => sendEvent(owner, "terminal", "onData", key, data),
      exit: (exitCode: number) => sendEvent(owner, "terminal", "onExit", key, exitCode),
    };
    return requireSessions().open({ key, cwd, cols, rows, client, owner: ownerOf(owner), start, meta });
  },
  write: (_e, key, data) => sessions?.write(key, data),
  resize: (_e, key, cols, rows) => sessions?.resize(key, cols, rows),
  // タブを閉じたとき
  close: (_e, key) => sessions?.close(key),
};
