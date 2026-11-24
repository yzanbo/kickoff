// プロジェクトの AI ごとのチャットの既定（プロジェクトごと。使い始めたときに 1 回読み、変えたら知らせ project_ai_defaults で直す = ほかの窓で変えても届く）
import type { ProjectAiDefaults } from "@shared/ai/chatOptions";
import type { ChatOptionsPatch, ProviderId } from "@shared/settings/types";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";
import type { StoreState } from "@/foundation/ui/store/storeTypes";
import { aiDefaultsApi } from "@/features/ai/ui/api/aiDefaults";

const projectAiDefaultsStore = createKeyedStore<number, ProjectAiDefaults>({
  load: (projectId) => aiDefaultsApi("GET /api/projects/:projectId/ai-defaults", { params: { projectId } }),
  reduce: { project_ai_defaults: (data, event, projectId) => (event.project_id === projectId ? event.defaults : data) },
  dropOn: { project_deleted: (event) => event.id },
});

/** そのプロジェクトの AI ごとの既定（projectId が undefined なら読まない） */
export const useProjectAiDefaults = (projectId: number | undefined): StoreState<ProjectAiDefaults> => useKeyedStore(projectAiDefaultsStore, projectId);

/** その AI の既定を置き換える（応答を待たずに店へ入れ、応答でそろえる。失敗したら読み直して投げる） */
export async function saveProjectAiDefaults(projectId: number, provider: ProviderId, options: ChatOptionsPatch): Promise<void> {
  projectAiDefaultsStore.update(projectId, (current) => ({ ...current, [provider]: options }));
  try {
    projectAiDefaultsStore.set(projectId, await aiDefaultsApi("PUT /api/projects/:projectId/ai-defaults", { params: { projectId }, body: { provider, options } }));
  } catch (e) {
    void projectAiDefaultsStore.reload(projectId).catch(() => {});
    throw e;
  }
}
