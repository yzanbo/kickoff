import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Setting } from "@/lib/storage";
import { useDragSize } from "./useDragSize";
import { useSetting } from "./useSetting";

/** 横幅いっぱいの切り替えで、欄の幅が動いている時間（tokens.css の --panel-motion-duration（0.24s）に少し足す） */
const STRETCH_MS = 300;

/** 並べる 2 つの決まり（覆うかの判定と、元の幅に戻すときの幅に使う） */
export interface CoverRules {
  /** 2 つの間隔 */
  gap: number;
  /** 横に残す側（ボード・メインの会話）がこれより狭くなるなら、欄で覆う */
  minRest: number;
}

/** 欄の幅 width のとき、横に残す側が狭すぎるか（そのときは欄で覆う）。まだ測っていなければ（whole が 0）覆わない */
export function leavesNarrowRest(whole: number, width: number, { gap, minRest }: CoverRules): boolean {
  if (whole <= 0) return false;
  const rest = whole - gap - Math.min(width, whole - gap);
  return rest < minRest;
}

interface CoverableWidthOptions extends CoverRules {
  /** 覚える欄の幅（px。ダブルクリックでその初めの値に戻す） */
  width: Setting<number>;
  /** 横幅いっぱい（もう一方を覆う）にしているかを覚える設定 */
  maximized: Setting<boolean>;
  /** 欄のいちばん狭い幅 */
  min: number;
  /** 欄の幅を書き込む CSS 変数（並べる要素に付ける） */
  widthVar: `--${string}`;
  /** 開き終えたときの欄の幅の CSS 変数（開閉で幅が動いている間も、中身をこの幅のまま置いて切り取る） */
  shownVar: `--${string}`;
}

/**
 * 横に並べた右側の欄の幅（左端のつまみのドラッグで変える。覚えておく）と、横幅いっぱい（もう一方を覆う）の切り替え。
 * 横に残す側が狭すぎるとき（ウィンドウ・外側の欄を狭めた）は、覚えた幅のまま覆い、広がったら戻す。
 * ボードの右のパネル（usePanelWidth）と、チャットの画面の右の欄（サブエージェントの欄）で共通。
 * bodyRef と style は 2 つを並べる要素に、paneRef は欄に、resizeHandle は欄の左端のつまみに渡す
 */
export function useCoverableWidth({ width: widthSetting, maximized: maximizedSetting, min, gap, minRest, widthVar, shownVar }: CoverableWidthOptions) {
  // 横幅いっぱい（もう一方を覆う）。戻すと、元の幅に戻る
  const [maximized, setMaximized] = useSetting(maximizedSetting);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  /**
   * 欄の左端をドラッグして幅を変える（もう一方を覆うところまで広げられる）。いま見えている幅から始め（横幅いっぱい・覆っているときは
   * その幅から。ドラッグすると横幅いっぱいは解除）、ドラッグ中は指の位置どおりの幅にし（覆っている状態から右へ動かすと、すぐにもう一方が見えてくる）、
   * 離したときに残す側が狭すぎる幅なら覆う。ダブルクリックで初めの幅に戻す
   */
  const resize = useDragSize({
    setting: widthSetting,
    edge: "start",
    min,
    keep: 0,
    write: widthVar,
    target: () => body,
    onStart: () => maximized && setMaximized(false),
    // ドラッグ中は描き直さずに幅を直接書き込むので、離したら描き直しで決まる値をここでも書く。覆うところで始めて覆うところで離すと、
    // 描き直しの値（100vw）は前と同じなので React が書き直さず、離した位置の幅が残っていた（もう一方は隠れたのに、その幅の空白が残った）
    onChange: (size) => body?.style.setProperty(widthVar, leavesNarrowRest(body.clientWidth, size, { gap, minRest }) ? "100vw" : `${size}px`),
  });
  const width = resize.size;
  /**
   * 横幅いっぱいを切り替えて、欄の幅が動いている途中か。開閉と違い、右端は動かず左端だけが伸び縮みするので、その間は中身を
   * 枠の幅に合わせて並べ直す（開き終えたときの幅のまま左端にそろえると、広げるときは中身が左端と一緒に滑り、戻すときは右側が空いた）
   */
  const [stretching, setStretching] = useState(false);
  const stretchTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(stretchTimer.current), []);
  const [whole, setWhole] = useState(0);

  useEffect(() => {
    if (!body) return;
    // 初めの幅はすぐ測る（ResizeObserver の最初の知らせは次の描画まで来ない。開き終えたときの幅をすぐ決めるため）
    setWhole(body.clientWidth);
    const observer = new ResizeObserver(() => setWhole(body.clientWidth));
    observer.observe(body);
    return () => observer.disconnect();
  }, [body]);

  const rules = { gap, minRest };
  /** 狭くてもう一方を覆っているか（横幅いっぱいとは別。広がれば元の幅に戻る） */
  const covering = leavesNarrowRest(whole, width, rules);
  /** 横にもう一方を残せるいちばん広い欄の幅（覆っているときに「元の幅に戻す」で縮める幅） */
  const fitWidth = Math.floor(whole - gap - minRest);
  /** 元の幅に戻せるか（覆っているときは、もう一方が残る幅まで縮める。それでも欄の最小の幅に足りないほど狭ければ戻せない） */
  const canRestore = !covering || fitWidth >= min;

  return {
    maximized,
    covering,
    canRestore,
    /**
     * 横幅いっぱい ⇔ 元の幅。見た目どおりに切り替える: 横幅いっぱい・覆っているときは元の幅に戻し（覚えた幅のままでは覆うなら、
     * もう一方が残る幅まで縮める）、それ以外は横幅いっぱいにする
     */
    toggleMaximized: () => {
      if (maximized || covering) {
        if (!canRestore) return;
        if (maximized) setMaximized(false);
        if (covering) resize.setSize(fitWidth);
      } else {
        setMaximized(true);
      }
      setStretching(true);
      window.clearTimeout(stretchTimer.current);
      stretchTimer.current = window.setTimeout(() => setStretching(false), STRETCH_MS);
    },
    stretching,
    resizing: resize.resizing,
    bodyRef: setBody,
    /** 欄（タブの列と中身の入れ物）に付ける（ドラッグを始めたときの幅を測る） */
    paneRef: resize.paneRef,
    /** 左端のつまみに渡す */
    resizeHandle: resize.handle,
    /**
     * 横幅いっぱい・覆うときは、CSS 側の上限（並べる要素の幅）まで広げる。
     * shownVar は開き終えたときの欄の幅（CSS の列の幅と同じ計算）。開閉で列の幅が動いている間も、中身はこの幅のまま置いて
     * 欄の枠で切り取り、右から滑り込むように見せる（動いている間に中身を並べ直さない）。まだ測っていなければ付けない（中身は枠いっぱい）
     */
    style: {
      [widthVar]: maximized || covering ? "100vw" : `${width}px`,
      ...(whole > 0 && { [shownVar]: `${maximized || covering ? whole : Math.min(width, whole - gap)}px` }),
    } as CSSProperties,
  };
}
