import { shell } from "electron";
import type { IpcHandlers } from "../ipc/register.js";
import { desktopPlatform } from "../platform/index.js";
import { existingFolder, vscodeFileUrl } from "./openCommands.js";
import { isWebUrl } from "./urls.js";

/** アプリの外で開く（IPC の externalApps）。OS ごとの開き方は platform/ の DesktopPlatform */
export const externalAppHandlers: IpcHandlers["externalApps"] = {
  // 開けなかったときの理由（shell.openPath が返す文）は、これまでどおり画面に返さない
  openPath: async (_e, target) => void (await shell.openPath(target)),
  // Finder で入っているフォルダを開いて選ぶ
  revealPath: (_e, target) => shell.showItemInFolder(target),
  // VS Code がなければ失敗を返す
  openInVSCode: (_e, target, line) => shell.openExternal(vscodeFileUrl(target, line)),
  // 設定・パネルのターミナルの ▾ で選ぶ
  terminals: () => desktopPlatform.installedTerminals(),
  // 外部のターミナル（選んだアプリ。既定は Terminal.app）で、そのフォルダを開く（アプリの中のターミナルとは別の窓）
  openTerminal: async (_e, dir, terminal = "terminal") => {
    await desktopPlatform.openTerminal(terminal, existingFolder(dir));
  },
  // パネルのブラウザの ▾ で選ぶ
  browsers: () => desktopPlatform.installedBrowsers(),
  // 外部のブラウザ（既定は Chrome）でページを開く。アプリが開けなければ、既定のブラウザで開く
  openBrowser: async (_e, url, browser = "chrome") => {
    try {
      await desktopPlatform.openBrowser(browser, url);
    } catch (e) {
      if (isWebUrl(url)) await shell.openExternal(url);
      else throw e;
    }
  },
};
