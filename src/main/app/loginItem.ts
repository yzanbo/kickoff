// ログイン時に起動する（設定の「スマホ連携」で選ぶ。既定はオフ）。値は OS の設定をそのまま読み、DB には持たない。
// ログイン時に起動したときは、窓を出さずに裏で動かす（Dock を押せば出る。index.ts）
import { app } from "electron";
import type { LoginItemState } from "@shared/ipc";
import type { IpcHandlers } from "../ipc/register.js";

/** いまの様子（開発版は Electron 本体が登録されてしまうので切り替えない） */
function loginItemState(): LoginItemState {
  if (!app.isPackaged) return { openAtLogin: false, available: false, reason: "開発版では切り替えられません（インストールしたアプリで選んでください）" };
  return { openAtLogin: app.getLoginItemSettings().openAtLogin, available: true, reason: null };
}

/** ログイン時に起動して開いたか（窓を出さずに裏で動かすため。macOS） */
export const openedAtLogin = (): boolean => app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin === true;

export const loginItemHandlers: IpcHandlers["loginItem"] = {
  get: () => loginItemState(),
  set: (_e, openAtLogin) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin });
    return loginItemState();
  },
};
