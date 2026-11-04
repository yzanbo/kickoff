import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { startHorizontalDrag } from "@/hooks/dragResize";
import { useStoredFlag, useStoredNumber } from "@/hooks/useStoredState";
import { PANEL_MAXIMIZED_KEY, PANEL_WIDTH_KEY } from "@/lib/storageKeys";

const DEFAULT_PANEL_WIDTH = 1127;
const MIN_PANEL_WIDTH = 360;
/** ボードとパネルの間隔（side-panel.css の .board-body.with-panel の gap） */
const PANEL_GAP = 12;
/**
 * パネルの横に残るボードがこれより狭くなるなら、パネルでボードを覆う（列が 1 本も入らない細い帯を残さない）。
 * 狭いボードは列を 1 本ずつめくる表示になる（board-columns.css の @container）ので、1 本が収まる幅にする
 */
const MIN_BOARD_WIDTH = 200;
/** 横幅いっぱいの切り替えで、パネルの幅が動いている時間（tokens.css の --panel-motion-duration（0.24s）に少し足す） */
const STRETCH_MS = 300;

/** パネルの幅 width のとき、横に残るボードが狭すぎるか（そのときはボードを覆う） */
function leavesNarrowBoard(bodyWidth: number, width: number): boolean {
  if (bodyWidth <= 0) return false;
  const board = bodyWidth - PANEL_GAP - Math.min(width, bodyWidth - PANEL_GAP);
  return board < MIN_BOARD_WIDTH;
}

/**
 * ボードの右側のパネルの幅（左端のつまみのドラッグで変える。覚えておく）と、横幅いっぱい（ボードを覆う）の切り替え。
 * 横に残るボードが狭すぎるとき（チャット欄を広げた・ウィンドウを狭めた）は、覚えた幅のままボードを覆い、広がったら戻す。
 * bodyRef と style は、ボードとパネルを並べる要素（useSidePanel の body）に渡す
 */
export function usePanelWidth() {
  const [panelWidth, setPanelWidth] = useStoredNumber(PANEL_WIDTH_KEY, DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  // 横幅いっぱい（ボードを覆う）。戻すと、元の幅に戻る
  const [maximized, setMaximized] = useStoredFlag(PANEL_MAXIMIZED_KEY);
  /**
   * 横幅いっぱいを切り替えて、パネルの幅が動いている途中か。開閉と違い、右端は動かず左端だけが伸び縮みするので、その間は中身を
   * 枠の幅に合わせて並べ直す（開き終えたときの幅のまま左端にそろえると、広げるときは中身が左端と一緒に滑り、戻すときは右側が空いた）
   */
  const [stretching, setStretching] = useState(false);
  const stretchTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(stretchTimer.current), []);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);

  useEffect(() => {
    if (!body) return;
    // 初めの幅はすぐ測る（ResizeObserver の最初の知らせは次の描画まで来ない。開き終えたときの幅 --panel-shown をすぐ決めるため）
    setBodyWidth(body.clientWidth);
    const observer = new ResizeObserver(() => setBodyWidth(body.clientWidth));
    observer.observe(body);
    return () => observer.disconnect();
  }, [body]);

  /** 狭くてボードを覆っているか（横幅いっぱいとは別。広がれば元の幅に戻る） */
  const covering = leavesNarrowBoard(bodyWidth, panelWidth);

  /**
   * パネルの左端をドラッグして幅を変える（ボードを覆うところまで広げられる）。ドラッグ中は指の位置どおりの幅にし
   * （覆っている状態から右へ動かすと、すぐにボードが見えてくる）、離したときにボードが狭すぎる幅なら覆う
   */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!body) return;
    const right = body.getBoundingClientRect().right;
    const max = body.clientWidth;
    // 横幅いっぱい・覆っているときは、今の幅からドラッグを始める（ドラッグすると横幅いっぱいは解除）
    let width = maximized || covering ? max : panelWidth;
    if (maximized) setMaximized(false);
    setResizing(true);
    startHorizontalDrag(e, {
      move: (clientX) => {
        width = Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(max, right - clientX)));
        body.style.setProperty("--panel-w", `${width}px`);
      },
      end: () => {
        setResizing(false);
        setPanelWidth(width);
      },
    });
  };

  /** 横にボードを残せるいちばん広いパネルの幅（覆っているときに「元の幅に戻す」で縮める幅） */
  const fitWidth = Math.floor(bodyWidth - PANEL_GAP - MIN_BOARD_WIDTH);
  /** 元の幅に戻せるか（覆っているときは、ボードが残る幅まで縮める。それでもパネルの最小の幅に足りないほど狭ければ戻せない） */
  const canRestore = !covering || fitWidth >= MIN_PANEL_WIDTH;

  return {
    maximized,
    covering,
    canRestore,
    /**
     * 横幅いっぱい ⇔ 元の幅。見た目どおりに切り替える: 横幅いっぱい・覆っているときは元の幅に戻し（覚えた幅のままでは覆うなら、
     * ボードが残る幅まで縮める）、それ以外は横幅いっぱいにする
     */
    toggleMaximized: () => {
      if (maximized || covering) {
        if (!canRestore) return;
        if (maximized) setMaximized(false);
        if (covering) setPanelWidth(fitWidth);
      } else {
        setMaximized(true);
      }
      setStretching(true);
      window.clearTimeout(stretchTimer.current);
      stretchTimer.current = window.setTimeout(() => setStretching(false), STRETCH_MS);
    },
    stretching,
    resizing,
    bodyRef: setBody,
    startResize,
    /**
     * 横幅いっぱい・覆うときは、CSS 側の上限（ボードの幅）まで広げる。
     * --panel-shown は開き終えたときのパネルの幅（side-panel.css の列の幅と同じ計算）。開閉で列の幅が動いている間も、中身はこの幅のまま置いて
     * パネルの枠で切り取り、右から滑り込むように見せる（動いている間に中身を並べ直さない）。まだ測っていなければ付けない（中身は枠いっぱい）
     */
    style: {
      "--panel-w": maximized || covering ? "100vw" : `${panelWidth}px`,
      ...(bodyWidth > 0 && { "--panel-shown": `${maximized || covering ? bodyWidth : Math.min(panelWidth, bodyWidth - PANEL_GAP)}px` }),
    } as CSSProperties,
  };
}
