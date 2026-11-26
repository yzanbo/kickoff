import type remarkMath from "remark-math";
import type rehypeKatex from "rehype-katex";
import type { MathPlugins } from "@/foundation/ui/markdown/markdownProcessor";
import { KATEX_OPTIONS, rehypeSafeMath } from "./katexOptions";
import { remarkMathGuard } from "./remarkMathGuard";

/**
 * 数式の部品の組（useMathPlugins が読み込んだ remark-math・rehype-katex を渡す。テストも同じ組で描く）。
 * 1 つの $ も数式として読み、remarkMathGuard が数式らしくないもの（値段・シェルの変数）を元の文に戻す。
 * KaTeX の設定は katexOptions.ts（ノートのライブプレビューと同じ）。描いたあとに、見えない文字を選べない・コピーに入らない形にする
 */
export function mathPluginsOf(remark: typeof remarkMath, rehype: typeof rehypeKatex): MathPlugins {
  return {
    remark: [[remark, { singleDollarTextMath: true }], remarkMathGuard],
    rehype: [[rehype, KATEX_OPTIONS], rehypeSafeMath],
  };
}
