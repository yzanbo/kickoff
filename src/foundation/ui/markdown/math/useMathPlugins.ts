import { useEffect } from "react";
import { createCell, useCell } from "@/foundation/ui/store";
import type { MathPlugins } from "@/foundation/ui/markdown/markdownProcessor";
import { mathPluginsOf } from "./mathPlugins";

// KaTeX は大きいので、数式が出てきたときに初めて読み込む（読み込んだら、すべての Markdown で使う）
const plugins = createCell<MathPlugins | null>(null);
let loading: Promise<void> | undefined;

function loadMath(): Promise<void> {
  loading ??= Promise.all([import("remark-math"), import("rehype-katex"), import("./katex.vendor.css")]).then(([remarkMath, rehypeKatex]) => {
    plugins.set(mathPluginsOf(remarkMath.default, rehypeKatex.default));
  });
  return loading;
}

/** 数式の部品。needed（数式の書き方を含みうる）なら読み込みを頼み、読み込むまでは null（そのあいだ数式は元の文のまま出る） */
export function useMathPlugins(needed: boolean): MathPlugins | null {
  const loaded = useCell(plugins);
  useEffect(() => {
    if (needed && !loaded) void loadMath();
  }, [needed, loaded]);
  return loaded;
}
