import type { WebviewTag } from "electron";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useDragSize } from "@/foundation/ui/hooks/useDragSize";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import type { SettingValue } from "@/foundation/ui/storage";
import { storage } from "./storage";
import { useDockedDevtools } from "./useDockedDevtools";

/** 開発者ツールを出す場所: 右・下（ブラウザのタブの中）・別のウィンドウ */
export const DEVTOOLS_DOCKS = storage.settings.devtoolsDock.choices;
export type DevtoolsDock = SettingValue<typeof storage.settings.devtoolsDock>;

export const DEVTOOLS_DOCK_LABELS: Record<DevtoolsDock, string> = {
  right: "右に表示",
  bottom: "下に表示",
  window: "別のウィンドウで表示",
};

const MIN_HEIGHT = 140;
type Point = { x: number; y: number };

/** 埋め込みブラウザの webContents の ID（まだ表示の準備ができていなければ undefined） */
function webContentsIdOf(view: WebviewTag | null | undefined): number | undefined {
  try {
    return view?.getWebContentsId();
  } catch {
    return undefined;
  }
}

/**
 * 埋め込みブラウザの開発者ツール。右・下に出すときは、ブラウザのタブの中の枠（slotRef）にメインプロセスがウィンドウに重ねた表示を置いてその中に表示し
 * （useDockedDevtools。<webview> の中には出さない）、別のウィンドウのときはメインプロセスで作ったウィンドウの中に表示する。
 * どこに出しているか（shown）はここで決めて持つ（Electron の「開いた・閉じた」の知らせは遅れて届くことがあり、頼らない）。
 * 前に出していたものはメインプロセスが閉じる。右と下の入れ替えは開き直さず、同じ枠の並べ方だけを変える（重ねた表示は枠に付いていく）
 */
export function useDevtools(viewRef: RefObject<WebviewTag | null>, visible: boolean) {
  const [dock, setDock] = useSetting(storage.settings.devtoolsDock);
  // いま出している場所（null は閉じている）。右・下は開くたびに新しく開く（embedKey）
  const [shown, setShown] = useState<DevtoolsDock | null>(null);
  const [embedKey, setEmbedKey] = useState(0);
  const inspectOnOpen = useRef<Point | null>(null);
  // 右に出すときの幅（左端のつまみ）と、下に出すときの高さ（上端のつまみ）。右と下で同じ入れ物（paneRef）を使う
  const paneRef = useRef<HTMLDivElement>(null);
  const width = useDragSize({ setting: storage.settings.devtoolsWidth, edge: "start", min: 260, keep: 240, pane: paneRef });
  const height = useDragSize({ setting: storage.settings.devtoolsHeight, axis: "y", edge: "start", min: MIN_HEIGHT, keep: 120, pane: paneRef });
  const embedded = shown === "right" || shown === "bottom";
  const resizing = width.resizing || height.resizing;

  const viewId = () => webContentsIdOf(viewRef.current);

  const docked = useDockedDevtools({
    targetId: viewId,
    active: embedded,
    openKey: embedKey,
    visible,
    resizing,
    takeInspect: () => {
      const point = inspectOnOpen.current;
      inspectOnOpen.current = null;
      return point ?? undefined;
    },
    onFail: () => setShown(null),
  });

  // 別のウィンドウを利用者が閉じたら、閉じた状態にする
  useEffect(
    () =>
      window.kickoff?.devtools.onWindowClosed((targetId) => {
        if (targetId === webContentsIdOf(viewRef.current)) setShown((now) => (now === "window" ? null : now));
      }),
    [viewRef],
  );

  // タブを閉じたら、開発者ツール（別のウィンドウ・右・下も）を閉じる
  useEffect(() => {
    const view = viewRef.current;
    return () => {
      // すでになくなっていれば ID は読めない
      const id = webContentsIdOf(view);
      if (id !== undefined) void window.kickoff?.devtools.close(id);
    };
  }, [viewRef]);

  const openAt = (where: DevtoolsDock, inspect?: Point) => {
    const id = viewId();
    if (id === undefined) return;
    if (where === "window") {
      inspectOnOpen.current = null;
      setShown("window");
      void window.kickoff?.devtools.openWindow(id, inspect).catch(() => setShown(null));
    } else {
      // タブの中に出していれば並べ方だけを変え、そうでなければ新しく開く
      if (!embedded) {
        inspectOnOpen.current = inspect ?? null;
        setEmbedKey((k) => k + 1);
      }
      setShown(where);
    }
  };

  const close = () => {
    inspectOnOpen.current = null;
    const id = viewId();
    if (id !== undefined) void window.kickoff?.devtools.close(id);
    setShown(null);
  };

  return {
    dock,
    /** いま出している場所（null は閉じている） */
    shown,
    /** タブの中に出しているとき、その場所 */
    embed: embedded ? { dock: shown as Exclude<DevtoolsDock, "window"> } : null,
    /** 右・下に出す開発者ツールを重ねる枠に付ける */
    slotRef: docked.slotRef,
    /** 重ねた表示を隠している間に、枠に出す見た目 */
    snapshot: docked.snapshot,
    /** 右・下に出す入れ物に付ける */
    paneRef,
    /** 右に出すときの幅・下に出すときの高さ */
    width: width.size,
    height: height.size,
    /** 右に出すときの左端のつまみ・下に出すときの上端のつまみに渡す */
    widthHandle: width.handle,
    heightHandle: height.handle,
    resizing,
    toggle: () => (shown ? close() : openAt(dock)),
    inspect: (point: Point) => {
      if (!shown) openAt(dock, point);
      else if (embedded && !docked.opened) inspectOnOpen.current = point;
      else viewRef.current?.inspectElement(point.x, point.y);
    },
    /** 出す場所を選ぶ（選んだ場所で開く。開いていれば、その場所へ移す） */
    changeDock: (next: DevtoolsDock) => {
      setDock(next);
      openAt(next);
    },
  };
}
