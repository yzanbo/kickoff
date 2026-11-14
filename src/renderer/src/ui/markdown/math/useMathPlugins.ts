import { useEffect, useSyncExternalStore } from "react";
import type { Options } from "react-markdown";
import { remarkMathGuard } from "./remarkMathGuard";

type PluggableList = NonNullable<Options["remarkPlugins"]>;

/** 数式の部品（remark-math・rehype-katex と KaTeX の CSS・フォント） */
export interface MathPlugins {
  remark: PluggableList;
  rehype: PluggableList;
}

// KaTeX は大きいので、数式が出てきたときに初めて読み込む（読み込んだら、すべての Markdown で使う）
let plugins: MathPlugins | null = null;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function loadMath(): Promise<void> {
  loading ??= Promise.all([import("remark-math"), import("rehype-katex"), import("katex/dist/katex.min.css")]).then(([remarkMath, rehypeKatex]) => {
    plugins = {
      // 1 つの $ も数式として読み、remarkMathGuard が数式らしくないもの（値段・シェルの変数）を元の文に戻す
      remark: [[remarkMath.default, { singleDollarTextMath: true }], remarkMathGuard],
      // 書き方の誤りは赤くせず、文字の色のまま元の式を出す
      rehype: [[rehypeKatex.default, { throwOnError: false, errorColor: "inherit", strict: false }]],
    };
    for (const listener of listeners) listener();
  });
  return loading;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => plugins;

/** 数式の部品。needed（数式の書き方を含みうる）なら読み込みを頼み、読み込むまでは null（そのあいだ数式は元の文のまま出る） */
export function useMathPlugins(needed: boolean): MathPlugins | null {
  const loaded = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (needed && !loaded) void loadMath();
  }, [needed, loaded]);
  return loaded;
}
