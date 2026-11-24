// プロジェクトの AI ごとのチャットの既定の受け口（取り決めは @shared/ai/contract.ts）
import { aiDefaultsContract } from "@shared/ai/contract";
import type { Project } from "@shared/projects/types";
import { implement, type Param } from "@/foundation/core/http/implement";
import { projectAiDefaultsSchema } from "@/features/ai/core/optionsSchemas";
import type { ProjectAiDefaultsStore } from "@/features/ai/core/db/projectAiDefaults";

export function aiDefaultsRoutes(d: { defaults: ProjectAiDefaultsStore; projectParam: Param<Project> }) {
  return implement(aiDefaultsContract, {
    context: { projectId: d.projectParam },
    "GET /api/projects/:projectId/ai-defaults": { run: ({ projectId }) => d.defaults.of(projectId.id) },
    "PUT /api/projects/:projectId/ai-defaults": { body: projectAiDefaultsSchema, run: ({ projectId, body }) => d.defaults.set(projectId.id, body.provider, body.options) },
  });
}
