import type { Hono } from "hono";
import { z } from "zod";
import type { DockerDbTarget } from "@shared/database/types";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import type { DatabaseService } from "@/features/database/core/service";
import type { DockerApi } from "@/features/docker/core/index";
import { queryOf } from "@/foundation/core/http/input";
import { lookups } from "@/foundation/core/http/lookups";
import { toImportCandidates } from "@/features/database/core/import/index";
import { dockerDbTarget, sameServerConnection } from "@/features/database/core/import/dockerTarget";

/** Docker タブの「DB で開く」の行き先（材料は docker の dbCandidate、案にするのは database。端末には開かない） */
export function dockerDbRoutes(app: Hono, { store, docker }: { store: DatabaseService["stores"] & Pick<ChatStoreDeps, "projects" | "chats" | "groups">; docker: Pick<DockerApi, "dbCandidate"> }) {
  const { withProject } = lookups(store);

  // 登録済みの同じ DB（種類・localhost・ポート）の接続か、DB クライアントの取り込みの案か、押せない理由
  app.get("/api/projects/:id/docker/db", withProject, async (c) => {
    const project = c.var.project;
    const compose = z.string().min(1).max(4000).parse(queryOf(c, "compose"));
    const service = z.string().min(1).max(200).parse(queryOf(c, "service"));
    const result = await dockerDbTarget(docker, project, compose, service);
    if ("blocked" in result) return c.json({ connection_id: null, candidate: null, blocked: result.blocked } satisfies DockerDbTarget);
    const connections = store.dbConnections.list(project.id);
    const same = sameServerConnection(connections, result.found);
    const candidate = same ? null : (toImportCandidates([result.found], connections, project.repo_path)[0] ?? null);
    return c.json({ connection_id: same?.id ?? null, candidate, blocked: null } satisfies DockerDbTarget);
  });
}
