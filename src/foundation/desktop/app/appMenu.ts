import { Menu, type MenuItemConstructorOptions } from "electron";

/**
 * アプリのメニュー。Electron の既定のメニュー（アプリ・ファイル・編集・表示・ウィンドウ）と同じものに、
 * ヘルプへ機能の部品の項目（診断の「性能の記録を取る」など。重いときに、再起動せずその場で記録を取るため）を足す（表示の「開発者ツールの切り替え」も残る）。
 * アプリの名前のメニューは、既定の並びの「Kickoff について」の下に機能の項目（更新の「アップデートを確認…」）を足す
 */
export function setAppMenu(helpItems: MenuItemConstructorOptions[], appItems: MenuItemConstructorOptions[] = []) {
  const appMenu: MenuItemConstructorOptions = {
    role: "appMenu",
    submenu: [
      { role: "about" },
      ...appItems,
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };
  const menu = Menu.buildFromTemplate([
    appMenu,
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help", submenu: helpItems },
  ]);
  Menu.setApplicationMenu(menu);
}
