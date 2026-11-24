import { useSyncExternalStore } from "react";

/** つながりの変化を知らせる（online・offline） */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * この Mac がネットワークにつながっているか（Wi-Fi が切れると false。AI の API に届くかまでは見ない）。
 * 外の値なので useSyncExternalStore で読む（Activity で隠している間に変わっても、表に戻したときに今の値を読む）
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}
