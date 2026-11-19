import { contextBridge, ipcRenderer } from "electron";
import { createNativeApi } from "@/foundation/desktop/preload/nativeApi";

// 画面に出すネイティブ機能（window.kickoff）。中身と型は IPC の取り決め（shared/ipc）から作る。
// デスクトップアプリでだけある（スマホのブラウザでは window.kickoff がない）
contextBridge.exposeInMainWorld("kickoff", createNativeApi(ipcRenderer));
