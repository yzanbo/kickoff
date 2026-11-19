// 仮の機能 legacy: 持ち主の機能より上の機能を使うルート（プロジェクト・添付の表示）を、全部の機能を作ったあとに登録する。持ち主の機能へ移したら消す
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { AiApi } from "@/features/ai/core/index";
import type { UploadStore } from "@/features/attachments/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { GitHubApi } from "@/features/github/core/index";
import type { NoteService } from "@/features/notes/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import type { UserViewRegistry } from "@/features/userView/core/index";
import { legacyRoutes } from "./legacyRoutes";

/** ルートが使う機能の口 */
export interface LegacyDeps {
  trash: TrashApi;
  ai: AiApi;
  chat: ChatApi;
  uploads: UploadStore;
  userViews: UserViewRegistry;
  github: GitHubApi;
  notes: NoteService;
}

/** プロジェクトと添付の表示のルート（中身は持ち主の機能のファイル） */
export function createLegacy(k: KernelWithStore, { trash, ai, chat, uploads, userViews, github, notes }: LegacyDeps): CoreFeature<null> {
  const { runner, approvals, streamingText, sessionsElsewhere } = chat;
  const deps = { store: k.store, bus: k.bus, streamingText, providers: ai.providers, runner, approvals, uploads, userViews, sessionsElsewhere };
  return { name: "legacy", api: null, ...legacyRoutes({ ...deps, trashBin: trash, prWatch: github.prWatch, githubAccounts: github.accounts, notes }) };
}
