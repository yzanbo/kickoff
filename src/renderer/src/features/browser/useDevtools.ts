import type { WebviewTag } from "electron";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { BROWSER_DEVTOOLS_DOCK, BROWSER_DEVTOOLS_HEIGHT, BROWSER_DEVTOOLS_WIDTH } from "@/lib/storageKeys";

/** 開発者ツールを出す場所: 右・下（ブラウザのタブの中）・別のウィンドウ */
export const DEVTOOLS_DOCKS = BROWSER_DEVTOOLS_DOCK.choices;
export type DevtoolsDock = SettingValue<typeof BROWSER_DEVTOOLS_DOCK>;

export const DEVTOOLS_DOCK_LABELS: Record<DevtoolsDock, string> = {
  right: "右に表示",
  bottom: "下に表示",
  window: "別のウィンドウで表示",
};

const MIN_HEIGHT = 140;

/**
 * 埋め込みブラウザの開発者ツール。右・下に出すときは、ブラウザのタブの中に置いたもう 1 つの埋め込みブラウザ（devtoolsRef）の中に表示し
 * （Electron の setDevToolsWebContents）、別のウィンドウのときはメインプロセスで作ったウィンドウの中に表示する。
 * どこに出しているか（shown）はここで決めて持つ（Electron の「開いた・閉じた」の知らせは遅れて届くことがあり、頼らない）。
 * 前に出していたものはメインプロセスが閉じる。右と下の入れ替えは開き直さず、同じ入れ物の並べ方だけを変える
 */
export function useDevtools(viewRef: RefObject<WebviewTag | null>) {
  const [dock, setDock] = useSetting(BROWSER_DEVTOOLS_DOCK);
  // いま出している場所（null は閉じている）。タブの中の入れ物は開くたびに作り直す（key。一度使った入れ物は使い回せない）
  const [shown, setShown] = useState<DevtoolsDock | null>(null);
  const [embedKey, setEmbedKey] = useState(0);
  const devtoolsRef = useRef<WebviewTag | null>(null);
  // 右に出すときの幅（左端のつまみ）と、下に出すときの高さ（上端のつまみ）。右と下で同じ入れ物（paneRef）を使う
  const paneRef = useRef<HTMLDivElement>(null);
  const width = useDragSize({ setting: BROWSER_DEVTOOLS_WIDTH, edge: "start", min: 260, keep: 240, pane: paneRef });
  const height = useDragSize({ setting: BROWSER_DEVTOOLS_HEIGHT, axis: "y", edge: "start", min: MIN_HEIGHT, keep: 120, pane: paneRef });
  const embedded = shown === "right" || shown === "bottom";

  const viewId = () => {
    try {
      return viewRef.current?.getWebContentsId();
    } catch {
      // まだ表示の準備ができていない
      return undefined;
    }
  };

  // 別のウィンドウを利用者が閉じたら、閉じた状態にする
  useEffect(
    () =>
      window.kickoff?.devtools.onWindowClosed((targetId) => {
        if (targetId === viewId()) setShown((now) => (now === "window" ? null : now));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // タブを閉じたら、開発者ツール（別のウィンドウも）を閉じる
  useEffect(() => {
    const view = viewRef.current;
    return () => {
      try {
        const id = view?.getWebContentsId();
        if (id !== undefined) void window.kickoff?.devtools.close(id);
      } catch {
        // すでになくなっている
      }
    };
  }, [viewRef]);

  // タブの中の入れ物ができたら、そこに開発者ツールを表示する
  useEffect(() => {
    const holder = devtoolsRef.current;
    if (!embedded || !holder) return;
    let done = false;
    const attach = () => {
      const id = viewId();
      if (done || id === undefined) return;
      done = true;
      void window.kickoff?.devtools.openIn(id, holder.getWebContentsId()).catch(() => setShown(null));
    };
    holder.addEventListener("dom-ready", attach);
    return () => {
      holder.removeEventListener("dom-ready", attach);
    };
    // 入れ物を作り直したとき（embedKey）だけ表示し直す。右と下の入れ替えでは表示し直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedKey, embedded]);

  const openAt = (where: DevtoolsDock) => {
    const id = viewId();
    if (id === undefined) return;
    if (where === "window") {
      setShown("window");
      void window.kickoff?.devtools.openWindow(id).catch(() => setShown(null));
    } else {
      // タブの中に出していれば並べ方だけを変え、そうでなければ入れ物を作り直して表示する
      if (!embedded) setEmbedKey((k) => k + 1);
      setShown(where);
    }
  };

  const close = () => {
    const id = viewId();
    if (id !== undefined) void window.kickoff?.devtools.close(id);
    setShown(null);
  };

  return {
    dock,
    /** いま出している場所（null は閉じている） */
    shown,
    /** タブの中に出しているとき、その場所と入れ物の key */
    embed: embedded ? { key: embedKey, dock: shown as Exclude<DevtoolsDock, "window"> } : null,
    devtoolsRef,
    /** 右・下に出す入れ物に付ける */
    paneRef,
    /** 右に出すときの幅・下に出すときの高さ */
    width: width.size,
    height: height.size,
    /** 右に出すときの左端のつまみ・下に出すときの上端のつまみに渡す */
    widthHandle: width.handle,
    heightHandle: height.handle,
    resizing: width.resizing || height.resizing,
    toggle: () => (shown ? close() : openAt(dock)),
    /** 出す場所を選ぶ（選んだ場所で開く。開いていれば、その場所へ移す） */
    changeDock: (next: DevtoolsDock) => {
      setDock(next);
      openAt(next);
    },
  };
}
