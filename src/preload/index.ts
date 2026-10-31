import { contextBridge, ipcRenderer } from "electron";

// 画面に公開するネイティブ機能（デスクトップアプリでのみ存在。スマホのブラウザでは undefined）
const api = {
  platform: process.platform,
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("kickoff:pick-folder"),
  openPath: (target: string): Promise<void> => ipcRenderer.invoke("kickoff:open-path", target),
};

contextBridge.exposeInMainWorld("kickoff", api);

export type KickoffNativeApi = typeof api;
