import type { AppliedTheme } from "@/lib/appliedTheme";
import type { HighlightPriority } from "@/lib/highlightPool";
import { highlightPool } from "@/lib/highlightWorkerEntry";
import type { CodeToken } from "@/lib/tokenCodec";

export type { CodeToken } from "@/lib/tokenCodec";

/**
 * コードを行ごとの色付きの断片にする（lang は languageOf などで決めた言語）。色を付けない言語・長すぎるコードは null。
 * 色付けは Web Worker の中で行う（Shiki の文法の読み込み・正規表現での解析で画面を止めない。lib/highlightPool.ts。メモの仕様書「0023_表示を軽くする」の案 20）。
 * 結果は覚え（512 件・合わせて 400 万字）、同じコード・言語・配色なら作り直さない。返す配列は覚えたものを共有するので、書き換えない。
 * signal で取り消すと、まだ始めていなければ捨てる。priority が near のものは、見えているもの（visible）のあとに色付けする
 */
export function highlightLines(
  code: string,
  lang: string | undefined,
  theme: AppliedTheme,
  opts?: { priority?: HighlightPriority; signal?: AbortSignal },
): Promise<CodeToken[][] | null> {
  return highlightPool.highlight(code, lang, theme, opts);
}

/** 覚えている色付けの結果（同期。最初の描画から色付きで出す）。色を付けないと分かっていれば null、まだなければ undefined */
export function peekHighlight(code: string, lang: string | undefined, theme: AppliedTheme): CodeToken[][] | null | undefined {
  return highlightPool.peek(code, lang, theme);
}
