import { ipcEntries, type NativeApi } from "@shared/ipc";

// 画面に出すネイティブ機能（window.kickoff）を、IPC の取り決めの表（shared/ipc/contract.ts）から作る。
// Electron に依らない（ipcRenderer は渡してもらう。テストでは偽物を渡す）

type Listener = (event: unknown, ...args: unknown[]) => void;

/** preload が使う ipcRenderer の口 */
export interface RendererIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: Listener): unknown;
  off(channel: string, listener: Listener): unknown;
}

/**
 * 表の項目ごとに、画面から呼ぶ関数を作る: invoke は返事を待つ・send は送るだけ・知らせ（on…）は受け取る関数を登録し、
 * 受け取りをやめる関数を返す。チャンネル名は表から作ったものだけを使う（手書きしない）
 */
export function createNativeApi(ipc: RendererIpc): NativeApi {
  const api: Record<string, Record<string, unknown>> = {};
  for (const { group, method, kind, channel } of ipcEntries()) {
    api[group] ??= {};
    api[group][method] =
      kind === "invoke"
        ? (...args: unknown[]) => ipc.invoke(channel, ...args)
        : kind === "send"
          ? (...args: unknown[]) => ipc.send(channel, ...args)
          : (listener: (...args: unknown[]) => void) => {
              const handler: Listener = (_event, ...args) => listener(...args);
              ipc.on(channel, handler);
              return () => void ipc.off(channel, handler);
            };
  }
  return api as NativeApi;
}
