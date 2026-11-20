// 定型文の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ProjectsApi } from "@/features/projects/core/index";
import { snippetRoutes } from "./routes";
import { createSnippetStore, type SnippetStore } from "./db/snippets";

/** 定型文のルート（AI のツール add_snippet はまだ chat の中） */
export function createSnippets(k: Kernel, deps: { projects: Pick<ProjectsApi, "require" | "store"> }): CoreFeature<{ store: SnippetStore }> {
  const store = createSnippetStore(k.db, (e) => k.bus.publish(e), deps.projects.store.trashedIds);
  return { name: "snippets", api: { store }, routes: [snippetRoutes({ snippets: store, projects: deps.projects })] };
}
