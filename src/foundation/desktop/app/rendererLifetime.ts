import type { WebContents } from "electron";

/** 同じ画面は一度だけ登録する。読み込み直し・終了・クラッシュでも画面の持ち物を残さない */
export function createRendererLifetimeWatcher(onGone: (contents: WebContents) => void): (contents: WebContents) => void {
  const watched = new WeakSet<WebContents>();
  return (contents) => {
    if (watched.has(contents)) return;
    watched.add(contents);
    const gone = () => onGone(contents);
    contents.on("destroyed", gone);
    contents.on("render-process-gone", gone);
    contents.on("did-start-navigation", (details) => {
      // アプリ内のハッシュ移動や埋め込みフレームの遷移では同じ画面が生きている
      if (details.isMainFrame && !details.isSameDocument) gone();
    });
  };
}
