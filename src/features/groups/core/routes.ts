// グループの受け口（取り決めは @shared/groups/contract.ts）
import { z } from "zod";
import { groupContract } from "@shared/groups/contract";
import type { Project } from "@shared/projects/types";
import { idParam, implement, type Param } from "@/foundation/core/http/implement";
import type { GroupStore } from "./db/groups";

const groupName = z.string().trim().min(1).max(60);
const nameBody = z.object({ name: groupName });

export function groupRoutes(d: { groups: GroupStore; projectParam: Param<Project> }) {
  return implement(groupContract, {
    context: { projectId: d.projectParam, groupId: idParam((id) => d.groups.get(id), "グループが見つかりません") },
    "GET /api/projects/:projectId/groups": { run: ({ projectId }) => d.groups.list(projectId.id) },
    "POST /api/projects/:projectId/groups": { body: nameBody, run: ({ projectId, body }) => d.groups.create(projectId.id, body.name) },
    "PUT /api/projects/:projectId/groups/order": { body: z.object({ ids: z.array(z.number().int()) }), run: ({ projectId, body }) => d.groups.reorder(projectId.id, body.ids) },
    "PATCH /api/groups/:groupId": { body: nameBody, run: ({ groupId, body }) => d.groups.rename(groupId.id, body.name) },
    "DELETE /api/groups/:groupId": { run: ({ groupId }) => void d.groups.delete(groupId.id) },
  });
}
