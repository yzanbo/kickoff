import { useSyncExternalStore } from "react";

/** 窓のフォーカスの変化を知らせる（focus・blur） */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("focus", onChange);
  window.addEventListener("blur", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    window.removeEventListener("blur", onChange);
  };
}

/**
 * Kickoff のウィンドウがいちばん前にあって、操作を受けているか（ほかのアプリを使っている間は false）。
 * 外の値なので useSyncExternalStore で読む（Activity で隠している間は購読が外れ、知らせを受け取れない。
 * state に写す形だと、表に戻したあとも隠す前の値のままになる）
 */
export function useWindowFocused(): boolean {
  return useSyncExternalStore(subscribe, () => document.hasFocus());
}
