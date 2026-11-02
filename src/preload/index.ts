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
  /** 埋め込みブラウザ（targetId）の開発者ツールを、別の埋め込みブラウザ（devtoolsId）の中に表示する */
  openDevToolsIn: (targetId: number, devtoolsId: number): Promise<void> => ipcRenderer.invoke("kickoff:browser-devtools-in", targetId, devtoolsId),
  /** 埋め込みブラウザ（targetId）の開発者ツールを、別のウィンドウで開く */
  openDevToolsWindow: (targetId: number): Promise<void> => ipcRenderer.invoke("kickoff:browser-devtools-window", targetId),
  /** 埋め込みブラウザの開発者ツールを閉じる（別のウィンドウも） */
  closeDevTools: (targetId: number): Promise<void> => ipcRenderer.invoke("kickoff:browser-devtools-close", targetId),
  /** 開発者ツールの別のウィンドウを、利用者が閉じたとき。戻り値で受け取りをやめる */
  onDevToolsWindowClosed: (listener: (targetId: number) => void): (() => void) => {
    const handler = (_e: unknown, targetId: number) => listener(targetId);
    ipcRenderer.on("kickoff:browser-devtools-window-closed", handler);
    return () => ipcRenderer.off("kickoff:browser-devtools-window-closed", handler);
  },
  /** Kickoff のウィンドウを前面に出す（通知を押したとき） */
  focusWindow: (): Promise<void> => ipcRenderer.invoke("kickoff:focus-window"),
  /** 内蔵ターミナル（右のパネルのタブ）。key はタブごとのキー */
  terminal: {
    /** シェルにつなぐ（なければ cwd で始める）。snapshot はいまの画面の内容（つなぎ直したとき） */
    open: (key: string, cwd: string, cols: number, rows: number): Promise<{ snapshot: string; created: boolean }> =>
      ipcRenderer.invoke("kickoff:terminal-open", key, cwd, cols, rows),
    write: (key: string, data: string): void => ipcRenderer.send("kickoff:terminal-write", key, data),
    resize: (key: string, cols: number, rows: number): void => ipcRenderer.send("kickoff:terminal-resize", key, cols, rows),
    /** シェルを止める（タブを閉じたとき） */
    close: (key: string): Promise<void> => ipcRenderer.invoke("kickoff:terminal-close", key),
    /** シェルの出力。戻り値で受け取りをやめる */
    onData: (listener: (key: string, data: string) => void): (() => void) => {
      const handler = (_e: unknown, key: string, data: string) => listener(key, data);
      ipcRenderer.on("kickoff:terminal-data", handler);
      return () => ipcRenderer.off("kickoff:terminal-data", handler);
    },
    /** シェルが終わったとき */
    onExit: (listener: (key: string, exitCode: number) => void): (() => void) => {
      const handler = (_e: unknown, key: string, exitCode: number) => listener(key, exitCode);
      ipcRenderer.on("kickoff:terminal-exit", handler);
      return () => ipcRenderer.off("kickoff:terminal-exit", handler);
    },
  },
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
