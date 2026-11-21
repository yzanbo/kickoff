// 定型文の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ProjectsApi } from "@/features/projects/core/index";
import { snippetRoutes } from "./routes";
import { createSnippetStore, type SnippetStore } from "./db/snippets";
import { snippetToolGroup } from "./tools";
import type { Chat } from "@shared/chat/types";

/** 定型文のルートと AI のツール add_snippet（呼んだチャットは chat の店から引く。chat はあとに作るので、呼ばれたときに引く関数を組み立てが渡す） */
export function createSnippets(k: Kernel, deps: { projects: Pick<ProjectsApi, "require" | "store">; chatOf: (chatId: number) => Chat | undefined }): CoreFeature<{ store: SnippetStore }> {
  const store = createSnippetStore(k.db, (e) => k.bus.publish(e), deps.projects.store.trashedIds);
  return { name: "snippets", api: { store }, routes: [snippetRoutes({ snippets: store, projects: deps.projects })], aiTools: [snippetToolGroup({ snippets: store, chatOf: deps.chatOf })] };
}
