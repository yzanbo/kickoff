import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { requireGroup, requireProject } from "./http.js";
import { groupName } from "./schemas.js";

/** チャットのグループ */
export function groupRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/projects/:id/groups", (c) => c.json(store.listGroups(requireProject(store, c.req.param("id")).id)));

  app.post("/api/projects/:id/groups", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { name } = z.object({ name: groupName }).parse(await c.req.json());
    return c.json(store.createGroup(project.id, name), 201);
  });

  app.put("/api/projects/:id/groups/order", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await c.req.json());
    return c.json(store.reorderGroups(project.id, ids));
  });

  app.patch("/api/groups/:id", async (c) => {
    const group = requireGroup(store, c.req.param("id"));
    const { name } = z.object({ name: groupName }).parse(await c.req.json());
    return c.json(store.renameGroup(group.id, name));
  });

  // グループだけを消す（中のチャットはグループなしに戻る）
  app.delete("/api/groups/:id", (c) => {
    const group = requireGroup(store, c.req.param("id"));
    store.deleteGroup(group.id);
    return c.json({ ok: true });
  });
}
