import type { WebviewTag } from "electron";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { startVerticalDrag } from "../../hooks/dragResize";
import { useDragWidth } from "../../hooks/useDragWidth";
import { useStoredChoice, useStoredNumber } from "../../hooks/useStoredState";

/** 開発者ツールを出す場所: 右・下（ブラウザのタブの中）・別のウィンドウ */
export const DEVTOOLS_DOCKS = ["right", "bottom", "window"] as const;
export type DevtoolsDock = (typeof DEVTOOLS_DOCKS)[number];

export const DEVTOOLS_DOCK_LABELS: Record<DevtoolsDock, string> = {
  right: "右に表示",
  bottom: "下に表示",
  window: "別のウィンドウで表示",
};

const DOCK_KEY = "kickoff:browser-devtools-dock";
const HEIGHT_KEY = "kickoff:browser-devtools-height";
const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 140;

/**
 * 埋め込みブラウザの開発者ツール。右・下に出すときは、ブラウザのタブの中に置いたもう 1 つの埋め込みブラウザ（devtoolsRef）の中に表示し
 * （Electron の setDevToolsWebContents）、別のウィンドウのときはメインプロセスで作ったウィンドウの中に表示する。
 * どこに出しているか（shown）はここで決めて持つ（Electron の「開いた・閉じた」の知らせは遅れて届くことがあり、頼らない）。
 * 前に出していたものはメインプロセスが閉じる。右と下の入れ替えは開き直さず、同じ入れ物の並べ方だけを変える
 */
export function useDevtools(viewRef: RefObject<WebviewTag | null>) {
  const [dock, setDock] = useStoredChoice<DevtoolsDock>(DOCK_KEY, DEVTOOLS_DOCKS, "right");
  // いま出している場所（null は閉じている）。タブの中の入れ物は開くたびに作り直す（key。一度使った入れ物は使い回せない）
  const [shown, setShown] = useState<DevtoolsDock | null>(null);
  const [embedKey, setEmbedKey] = useState(0);
  const devtoolsRef = useRef<WebviewTag | null>(null);
  const width = useDragWidth({ storageKey: "kickoff:browser-devtools-width", initial: 420, min: 260, keep: 240, side: "right" });
  const [height, setHeight] = useStoredNumber(HEIGHT_KEY, DEFAULT_HEIGHT);
  const [resizingHeight, setResizingHeight] = useState(false);
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
      window.kickoff?.onDevToolsWindowClosed((targetId) => {
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
        if (id !== undefined) void window.kickoff?.closeDevTools(id);
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
      void window.kickoff?.openDevToolsIn(id, holder.getWebContentsId()).catch(() => setShown(null));
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
      void window.kickoff?.openDevToolsWindow(id).catch(() => setShown(null));
    } else {
      // タブの中に出していれば並べ方だけを変え、そうでなければ入れ物を作り直して表示する
      if (!embedded) setEmbedKey((k) => k + 1);
      setShown(where);
    }
  };

  const close = () => {
    const id = viewId();
    if (id !== undefined) void window.kickoff?.closeDevTools(id);
    setShown(null);
  };

  /** 上の端をドラッグして、下に出した開発者ツールの高さを変える */
  const startResizeHeight = (e: ReactPointerEvent<HTMLElement>) => {
    const pane = e.currentTarget.nextElementSibling as HTMLElement | null;
    const body = pane?.parentElement;
    if (!pane || !body) return;
    const bottom = body.getBoundingClientRect().bottom;
    const max = body.clientHeight - 120;
    let next = height;
    setResizingHeight(true);
    startVerticalDrag(e, {
      move: (clientY) => {
        next = Math.round(Math.max(MIN_HEIGHT, Math.min(max, bottom - clientY)));
        pane.style.height = `${next}px`;
      },
      end: () => {
        setResizingHeight(false);
        setHeight(next);
      },
    });
  };

  return {
    dock,
    /** いま出している場所（null は閉じている） */
    shown,
    /** タブの中に出しているとき、その場所と入れ物の key */
    embed: embedded ? { key: embedKey, dock: shown as Exclude<DevtoolsDock, "window"> } : null,
    devtoolsRef,
    width,
    height,
    resizing: width.resizing || resizingHeight,
    startResizeHeight,
    resetHeight: () => setHeight(DEFAULT_HEIGHT),
    toggle: () => (shown ? close() : openAt(dock)),
    /** 出す場所を選ぶ（選んだ場所で開く。開いていれば、その場所へ移す） */
    changeDock: (next: DevtoolsDock) => {
      setDock(next);
      openAt(next);
    },
  };
}
