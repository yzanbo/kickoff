// 定型文の受け口（取り決めは @shared/snippets/contract.ts）
import { snippetContract } from "@shared/snippets/contract";
import type { Project } from "@shared/projects/types";
import type { Store } from "@/foundation/core/db/store";
import { idParam, implement } from "@/foundation/core/http/implement";
import { newSnippetSchema, snippetOrderSchema, snippetPatchSchema } from "./schemas";

export function snippetRoutes(d: { snippets: Store["snippets"]; projects: { require(id: number): Project } }) {
  return implement(snippetContract, {
    context: { snippetId: idParam((id) => d.snippets.get(id), "定型文が見つかりません") },
    "GET /api/snippets": { run: () => d.snippets.list() },
    "POST /api/snippets": {
      body: newSnippetSchema,
      run: ({ body }) => {
        if (body.project_id !== null) d.projects.require(body.project_id);
        return d.snippets.create(body);
      },
    },
    "PUT /api/snippets/order": { body: snippetOrderSchema, run: ({ body }) => d.snippets.reorder(body.ids) },
    "PATCH /api/snippets/:snippetId": {
      body: snippetPatchSchema,
      run: ({ snippetId, body }) => {
        if (body.project_id != null) d.projects.require(body.project_id);
        return d.snippets.update(snippetId.id, body);
      },
    },
    "DELETE /api/snippets/:snippetId": { run: ({ snippetId }) => void d.snippets.delete(snippetId.id) },
  });
}
