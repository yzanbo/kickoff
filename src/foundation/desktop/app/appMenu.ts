import { Menu, type MenuItemConstructorOptions } from "electron";

/**
 * アプリのメニュー。Electron の既定のメニュー（アプリ・ファイル・編集・表示・ウィンドウ）と同じものに、
 * ヘルプへ機能の部品の項目（診断の「性能の記録を取る」など。重いときに、再起動せずその場で記録を取るため）を足す（表示の「開発者ツールの切り替え」も残る）
 */
export function setAppMenu(helpItems: MenuItemConstructorOptions[]) {
  const menu = Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help", submenu: helpItems },
  ]);
  Menu.setApplicationMenu(menu);
}
