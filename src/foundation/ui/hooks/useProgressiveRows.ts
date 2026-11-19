import { createContext, startTransition, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { allocateColumns, allocateRows, columnsInView, createProgressive, firstRowLimit, progressiveSlice } from "@/foundation/ui/lib/progressive";

// 長い一覧（サイドバーのプロジェクトのチャットの一覧・ボード）を段階に分けて描く（決まりは lib/progressive.ts）。
// ページの入口の useProgressivePage が、開いた直後は画面に入る数（ページ全体で 1 つの上限）を、最初の描画のあとは上限なし（Infinity）を返し、
// RowBudget で中の一覧へ配る。縦に並ぶまとまりは useRowBudgets で上から順に分け、行を描く一覧は useProgressiveRows で頭から配った数だけ描く。

const progressive = createProgressive({
  frame: (callback) => {
    const id = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(id);
  },
  transition: startTransition,
  flushSync,
});

/**
 * まだ残りを描いていない一覧を、すぐにすべて描く（キーでの移動・Shift での範囲の選択・ドラッグの前。画面に並ぶ行の DOM を読む操作が、
 * 省いた行も拾えるように）。イベントの受け口・タイマーの中で呼ぶ（描いている途中・effect の中では呼ばない）
 */
export const ensureAllRows = (): void => progressive.ensureAll();

/** 中の一覧に配る行の上限（Infinity = すべて描く。ページの外の一覧はいつもすべて） */
const RowBudget = createContext<number>(Number.POSITIVE_INFINITY);
/** 中の一覧に行の上限を配る（value に useProgressivePage・useRowBudgets の値） */
export const RowBudgetScope = RowBudget.Provider;

/**
 * 長い一覧のページの入口: key（見え方。まとめ方・表示・開いたか・読み込めたかなど）が変わったら、初めは画面に入る数だけ
 * （hidden = 見えていないページなら 0）、最初の描画が出たあと割り込める作業で上限なし。返す値を RowBudgetScope に渡す
 */
export function useProgressivePage(key: string, hidden = false): number {
  // 残りまで描き終えた見え方（key が変われば、また初めから）
  const [done, setDone] = useState<string | null>(null);
  const all = done === key;
  useEffect(() => {
    if (all) return;
    return progressive.open(() => setDone(key));
  }, [key, all]);
  if (all) return Number.POSITIVE_INFINITY;
  return hidden ? 0 : firstRowLimit(window.innerHeight);
}

/**
 * まとまり（counts はまとまりごとの行の数。閉じているものは 0）に、いまの上限を配る。縦に並ぶ（stacked）なら上から順に分け、
 * 横に並ぶ（カンバンの列。どれも上から見える）なら、窓の幅に入りうる左の列にそれぞれ同じ上限、横にはみ出して見えない列は 0
 * （最初の描画のあと、上限なしですべて描く）
 */
export function useRowBudgets(counts: readonly number[], stacked = true): number[] {
  const budget = useContext(RowBudget);
  return stacked ? allocateRows(counts, budget) : allocateColumns(counts.length, budget, Number.isFinite(budget) ? columnsInView(boardWidth()) : counts.length);
}

/**
 * 横に並ぶ列に使える幅の見込み（描く前なので列の入れ物はまだない。窓の幅から、先に描いてある左のサイドバー・縦の列の右端までを引く）。
 * 上限なしのとき（最初の描画のあと）は読まない
 */
function boardWidth(): number {
  const left = document.querySelector(".sidebar")?.getBoundingClientRect().right ?? 0;
  return window.innerWidth - left;
}

/** 行を描く一覧: いまの上限の数だけ頭から（収まれば同じ配列のまま）と、省いた行の数（ui/ProgressiveRows.tsx の ProgressiveSpacer で場所を取る） */
export function useProgressiveRows<T>(rows: readonly T[]): { shown: readonly T[]; omitted: number } {
  return progressiveSlice(rows, useContext(RowBudget));
}
