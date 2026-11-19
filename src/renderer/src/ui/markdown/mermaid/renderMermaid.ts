import type { Mermaid } from "mermaid";
import type { AppliedTheme } from "@/lib/appliedTheme";
import { createLruMap } from "@/lib/lruMap";
import { fixLabelContrast } from "./fixLabelContrast";
import { diagramBackground, mermaidConfig } from "./mermaidConfig";

/**
 * 描いた図（SVG）を覚えておく数と SVG の字数の合計（同じ図を開き直したとき・タブを切り替えたとき・流れの窓で行を外して戻したときに、描き直さない。
 * よく見る図ほど残す。1 件の SVG は数十〜数百 KB で、組み立ては画面のスレッドで数十〜数百 ms かかる）
 */
const CACHE_LIMIT = 200;
const CACHE_CHARS = 20_000_000;
const cache = createLruMap<string, string>(CACHE_LIMIT, { maxWeight: CACHE_CHARS, weigh: (svg) => svg.length });

/** 描いた図の高さ（図のソースごと。次に同じ図を描くまでの枠の高さにする。数だけ覚える） */
const heights = createLruMap<string, number>(500);

/** 描く前の枠の高さの見積もり（測った高さがなければ。枠の最小 96px に、1 行 ≒ 1 つの節として 22px ずつ。上限 600px） */
export function mermaidEstimate(code: string): number {
  const lines = code.split("\n").filter((line) => line.trim() !== "").length;
  return Math.min(600, 96 + 22 * lines);
}

/** 描く前の枠の高さ（前に描いたときの高さ、なければ見積もり） */
export const mermaidBoxHeight = (code: string): number => heights.peek(code) ?? mermaidEstimate(code);

/** 描いた図の高さを覚える */
export const rememberMermaidHeight = (code: string, height: number) => {
  if (height > 0) heights.set(code, height);
};

// 図を描くライブラリは大きいので、図が出てきたときに初めて読み込む
let loading: Promise<Mermaid> | undefined;
const loadMermaid = () => (loading ??= import("mermaid").then((m) => m.default));

// 設定（配色）はアプリ全体で 1 つなので、1 つずつ順に描く
let queue: Promise<unknown> = Promise.resolve();
let count = 0;

const cacheKey = (code: string, theme: AppliedTheme) => `${theme}\n${code}`;

/** 描いたことのある図（なければ undefined）。最初の描画から、そのまま出すのに使う */
export function cachedMermaid(code: string, theme: AppliedTheme): string | undefined {
  return cache.get(cacheKey(code, theme));
}

/** Mermaid の図を SVG にする。描けないとき（書き方の誤り・大きすぎる図）は失敗する */
export function renderMermaid(code: string, theme: AppliedTheme): Promise<string> {
  const key = cacheKey(code, theme);
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const task = queue.then(async () => {
    const mermaid = await loadMermaid();
    mermaid.initialize(mermaidConfig(theme));
    const rendered = await mermaid.render(`mermaid-${++count}`, code);
    // 図を書く側が指定した塗り・文字色と、テーマの色が重なって、文字が読めなくならないようにする
    const svg = fixLabelContrast(rendered.svg, diagramBackground());
    // 上限を超えたら、いちばん長く使っていないものから捨てる
    cache.set(key, svg);
    return svg;
  });
  queue = task.catch(() => undefined);
  return task;
}
