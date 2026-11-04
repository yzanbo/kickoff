import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { groupName } from "./schemas.js";

/** チャットのグループ */
export function groupRoutes(app: Hono, { store }: ServerDeps) {
  const { withProject, withGroup } = lookups(store);

  app.get("/api/projects/:id/groups", withProject, (c) => c.json(store.groups.list(c.var.project.id)));

  app.post("/api/projects/:id/groups", withProject, async (c) => {
    const { name } = z.object({ name: groupName }).parse(await jsonBody(c));
    return c.json(store.groups.create(c.var.project.id, name), 201);
  });

  app.put("/api/projects/:id/groups/order", withProject, async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await jsonBody(c));
    return c.json(store.groups.reorder(c.var.project.id, ids));
  });

  app.patch("/api/groups/:id", withGroup, async (c) => {
    const { name } = z.object({ name: groupName }).parse(await jsonBody(c));
    return c.json(store.groups.rename(c.var.group.id, name));
  });

  // グループだけを消す（中のチャットはグループなしに戻る）
  app.delete("/api/groups/:id", withGroup, (c) => {
    store.groups.delete(c.var.group.id);
    return c.json({ ok: true });
  });
}
