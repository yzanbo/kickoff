import { contextBridge, ipcRenderer } from "electron";
import { createNativeApi } from "@/foundation/desktop/preload/nativeApi";
import { NATIVE_API } from "@/app/shared/ipc";

// 画面に出すネイティブ機能（window.kickoff）。中身と型は IPC の取り決めの表（src/app/shared/ipc.ts）から作る。
// デスクトップアプリでだけある（スマホのブラウザでは window.kickoff がない）
contextBridge.exposeInMainWorld("kickoff", createNativeApi(ipcRenderer, NATIVE_API));
