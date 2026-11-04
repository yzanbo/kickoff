import { contextBridge, ipcRenderer } from "electron";
import type { BrowserExtensionInfo, DiagnosticsFolders, DiagnosticsState } from "../core/types.js";

// 画面が preload から型を読めるように、コアの型をここからも出す
export type { BrowserExtensionInfo };

/** メインプロセスからの知らせ（channel）を受け取る。戻り値で受け取りをやめる */
function subscribe<T extends unknown[]>(channel: string, listener: (...args: T) => void): () => void {
  const handler = (_e: unknown, ...args: unknown[]) => listener(...(args as T));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

// 画面に公開するネイティブ機能（デスクトップアプリでのみ存在。スマホのブラウザでは undefined）
const api = {
  platform: process.platform,
  pickFolder: (title?: string): Promise<string | null> => ipcRenderer.invoke("kickoff:pick-folder", title),
  openPath: (target: string): Promise<void> => ipcRenderer.invoke("kickoff:open-path", target),
  /** 外部のターミナル（terminal: アプリの id。省くと Terminal.app）で、そのフォルダを開く */
  openExternalTerminal: (dir: string, terminal?: string): Promise<void> => ipcRenderer.invoke("kickoff:open-external-terminal", dir, terminal),
  /** この Mac に入っている外部のターミナルの id */
  externalTerminals: (): Promise<string[]> => ipcRenderer.invoke("kickoff:external-terminals"),
  /** VS Code でファイルを開く（line があればその行へ） */
  openInVSCode: (target: string, line?: number): Promise<void> => ipcRenderer.invoke("kickoff:open-in-vscode", target, line),
  /** 参照資料にするフォルダ・ファイルを選ぶ（複数可） */
  pickReferences: (): Promise<string[]> => ipcRenderer.invoke("kickoff:pick-references"),
  /** 外部のブラウザ（browser: アプリの id。省くと Chrome）でページを開く（url がなければアプリを開くだけ） */
  openInBrowser: (url: string | undefined, browser?: string): Promise<void> => ipcRenderer.invoke("kickoff:open-in-browser", url, browser),
  /** この Mac に入っている外部のブラウザの id */
  externalBrowsers: (): Promise<string[]> => ipcRenderer.invoke("kickoff:external-browsers"),
  /** 埋め込みブラウザ（targetId）の開発者ツールを、別の埋め込みブラウザ（devtoolsId）の中に表示する */
  openDevToolsIn: (targetId: number, devtoolsId: number): Promise<void> => ipcRenderer.invoke("kickoff:browser-devtools-in", targetId, devtoolsId),
  /** 埋め込みブラウザ（targetId）の開発者ツールを、別のウィンドウで開く */
  openDevToolsWindow: (targetId: number): Promise<void> => ipcRenderer.invoke("kickoff:browser-devtools-window", targetId),
  /** 埋め込みブラウザの開発者ツールを閉じる（別のウィンドウも） */
  closeDevTools: (targetId: number): Promise<void> => ipcRenderer.invoke("kickoff:browser-devtools-close", targetId),
  /** 開発者ツールの別のウィンドウを、利用者が閉じたとき。戻り値で受け取りをやめる */
  onDevToolsWindowClosed: (listener: (targetId: number) => void): (() => void) => subscribe("kickoff:browser-devtools-window-closed", listener),
  /** 性能の記録（重いときに、その場で 10 秒の記録を取って保存する。メニューの「ヘルプ」からも始まる） */
  diagnostics: {
    start: (): Promise<void> => ipcRenderer.invoke("kickoff:diagnostics-start"),
    /** 保存先と最近の記録のフォルダ（新しい順） */
    folders: (): Promise<DiagnosticsFolders> => ipcRenderer.invoke("kickoff:diagnostics-folders"),
    /** 保存先を Finder で開く（まだなければ作る） */
    openRoot: (): Promise<void> => ipcRenderer.invoke("kickoff:diagnostics-open-root"),
    /** 記録の様子（記録中・保存中・保存した・失敗）。戻り値で受け取りをやめる */
    onState: (listener: (state: DiagnosticsState) => void): (() => void) => subscribe("kickoff:diagnostics", listener),
  },
  /** Mac の通知を出す（projectId・runId を渡すと、押したときにそのチャットを開く）。届かなかったら理由を返す */
  notify: (args: { title: string; body: string; projectId?: number; runId?: number }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("kickoff:notify", args),
  /** Mac の「システム設定 → 通知」を開く（Kickoff の通知を許可する・出し方を変える） */
  openNotificationSettings: (): Promise<void> => ipcRenderer.invoke("kickoff:open-notification-settings"),
  /** 通知が押されて、そのチャットを開くとき（Kickoff を起動し直したあとに、前の通知が押されたときも）。戻り値で受け取りをやめる */
  onOpenRun: (listener: (projectId: number, runId: number) => void): (() => void) => subscribe("kickoff:open-run", listener),
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
    onData: (listener: (key: string, data: string) => void): (() => void) => subscribe("kickoff:terminal-data", listener),
    /** シェルが終わったとき */
    onExit: (listener: (key: string, exitCode: number) => void): (() => void) => subscribe("kickoff:terminal-exit", listener),
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

contextBridge.exposeInMainWorld("kickoff", api);

export type KickoffNativeApi = typeof api;
