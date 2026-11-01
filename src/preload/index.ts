import { contextBridge, ipcRenderer } from "electron";

// 画面に公開するネイティブ機能（デスクトップアプリでのみ存在。スマホのブラウザでは undefined）
const api = {
  platform: process.platform,
  pickFolder: (title?: string): Promise<string | null> => ipcRenderer.invoke("kickoff:pick-folder", title),
  openPath: (target: string): Promise<void> => ipcRenderer.invoke("kickoff:open-path", target),
  /** VS Code でファイルを開く（line があればその行へ） */
  openInVSCode: (target: string, line?: number): Promise<void> => ipcRenderer.invoke("kickoff:open-in-vscode", target, line),
  /** 参照資料にするフォルダ・ファイルを選ぶ（複数可） */
  pickReferences: (): Promise<string[]> => ipcRenderer.invoke("kickoff:pick-references"),
  openInChrome: (url: string): Promise<void> => ipcRenderer.invoke("kickoff:open-in-chrome", url),
  /** Kickoff のウィンドウを前面に出す（通知を押したとき） */
  focusWindow: (): Promise<void> => ipcRenderer.invoke("kickoff:focus-window"),
  /** 埋め込みブラウザの拡張機能（React DevTools など） */
  browserExtensions: {
    list: (): Promise<BrowserExtensionInfo[]> => ipcRenderer.invoke("kickoff:browser-extensions"),
    install: (key: "react-devtools"): Promise<BrowserExtensionInfo[]> => ipcRenderer.invoke("kickoff:browser-extension-install", key),
    importFromChrome: (key: "react-devtools"): Promise<BrowserExtensionInfo[]> =>
      ipcRenderer.invoke("kickoff:browser-extension-import", key),
    addFolder: (): Promise<BrowserExtensionInfo[]> => ipcRenderer.invoke("kickoff:browser-extension-add-folder"),
    remove: (path: string): Promise<BrowserExtensionInfo[]> => ipcRenderer.invoke("kickoff:browser-extension-remove", path),
  },
};

export interface BrowserExtensionInfo {
  name: string;
  version: string;
  path: string;
  source: "webstore" | "chrome-profile" | "folder";
}

contextBridge.exposeInMainWorld("kickoff", api);

export type KickoffNativeApi = typeof api;
