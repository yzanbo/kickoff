import type { CSSProperties, RefObject } from "react";
import type { Run } from "./rowLayout";
import type { RowNewest } from "./rowWindowState";

/** 行の窓（useRowWindow）の入出力 */

/** 窓の中身を測るときの本文の幅と文字の倍率（幅は 30px 刻み。見積もりを作り直す合図） */
export interface RowLayoutContext {
  width: number;
  scale: number;
}

export interface RowWindowOptions<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** 測っていない行の高さ（px） */
  estimate: (item: T, layout: RowLayoutContext) => number;
  /** 測った高さを覚える所（チャットごとの見え方の店の sizes など） */
  sizes: { peek(key: string): number | undefined; set(key: string, value: number): void };
  /** 行を測った（見積もりの補正に使う） */
  onMeasured?: (item: T, height: number, layout: RowLayoutContext) => void;
  /** スクロールする枠 */
  scroller: RefObject<HTMLElement | null>;
  /** 行の並び（gap・本文の幅・文字の倍率をここから測る） */
  list: RefObject<HTMLElement | null>;
  newest: RowNewest;
  /** 開いたときの位置（覚えた位置か、新しい側の端） */
  initial: { key: string; offset: number } | null;
  /** 変わったら窓を作り直す（チャットが替わった） */
  resetKey: unknown;
  /** 読んだ範囲の始まり（先頭の行の側）に近づいた */
  onNearStart?: () => void;
  /** 読んだ範囲の終わり（末尾の行の側）に近づいた */
  onNearEnd?: () => void;
  /** 描く行が変わって描き終えたら呼ぶ（チャットの中の検索が印を付け直す合図） */
  onDrawn?: () => void;
}

export interface RowWindow {
  runs: Run[];
  /** 描く行を変えた回数（変わったら、描いた DOM から決めるもの（上に貼り付ける指示）を確かめ直す） */
  version: number;
  /** 行の包みに付ける ref（測る。同じキーには同じ関数） */
  measureRef: (key: string) => (el: HTMLElement | null) => () => void;
  /** 行の包みに付けるスタイル（描くのを省いている間の大きさ --row-est。描いた時点の値のまま変えない） */
  rowStyle: (key: string) => CSSProperties;
  /** 行 index とその前後（around px。既定は画面の高さの 1.5 倍）を描き、描いて測り終えたら解決する（移る処理はこれを待ってから移る） */
  reveal: (index: number, around?: number) => Promise<void>;
  /** 新しい側の端へ（遠ければ 1 画面手前まで一気に寄せてから、smooth ならなめらかに） */
  toNewest: (smooth: boolean) => Promise<void>;
  /** 行 key の上端の、見えている上端からの距離（描いていない行は前からの和で。行がなければ undefined） */
  topOf: (key: string) => number | undefined;
  /** 読んでいた位置（見えている上端をまたぐ行のキーと、その行の上端から見えている上端までの距離。行がなければ null） */
  position: () => { key: string; offset: number } | null;
  /** スクロールした（範囲を決め直す） */
  onScroll: () => void;
}
