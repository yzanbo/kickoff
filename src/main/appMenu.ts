import { Menu, type BrowserWindow } from "electron";
import { DIAGNOSTICS_SECONDS, openDiagnosticsRoot, startDiagnostics } from "./diagnostics.js";

/**
 * アプリのメニュー。Electron の既定のメニュー（アプリ・ファイル・編集・表示・ウィンドウ）と同じものに、
 * ヘルプの「性能の記録を取る」を足す（重いときに、再起動せずその場で記録を取るため。表示の「開発者ツールの切り替え」も残る）
 */
export function setAppMenu(mainWindow: () => BrowserWindow | undefined) {
  const menu = Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: `性能の記録を取る（${DIAGNOSTICS_SECONDS} 秒）`, click: () => void startDiagnostics(mainWindow()) },
        { label: "性能の記録の保存先を開く", click: () => void openDiagnosticsRoot() },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}
