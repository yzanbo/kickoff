// 定型文の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { ProjectsApi } from "@/features/projects/core/index";
import { snippetRoutes } from "./routes";

/** 定型文のルート（AI のツール add_snippet はまだ chat の中） */
export function createSnippets(k: KernelWithStore, deps: { projects: Pick<ProjectsApi, "require"> }): CoreFeature<null> {
  return { name: "snippets", api: null, routes: [snippetRoutes({ snippets: k.store.snippets, projects: deps.projects })] };
}
