import type { Mermaid } from "mermaid";
import type { AppliedTheme } from "@/lib/appliedTheme";
import { mermaidConfig } from "./mermaidConfig";

/** 描いた図（SVG）を覚えておく数（同じ図を開き直したとき・タブを切り替えたときに、描き直さない） */
const CACHE_LIMIT = 50;
const cache = new Map<string, string>();

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
    const { svg } = await mermaid.render(`mermaid-${++count}`, code);
    cache.set(key, svg);
    // 古いものから捨てる
    for (const old of cache.keys()) {
      if (cache.size <= CACHE_LIMIT) break;
      cache.delete(old);
    }
    return svg;
  });
  queue = task.catch(() => undefined);
  return task;
}
