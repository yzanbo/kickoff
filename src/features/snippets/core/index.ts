// 定型文の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { snippetRoutes } from "./routes/snippets";

/** 定型文のルート（AI のツール add_snippet はまだ chat の中） */
export function createSnippets(k: KernelWithStore): CoreFeature<null> {
  return { name: "snippets", api: null, routes: [{ legacy: (app) => snippetRoutes(app, { store: k.store }) }] };
}
