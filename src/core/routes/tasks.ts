import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { PHASES, TASK_STATUSES } from "../types.js";
import { requireArtifact, requireProject, requireTask } from "./http.js";

const taskInputSchema = z.object({
  phase: z.enum(PHASES),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(""),
  acceptance_criteria: z.string().max(20_000).default(""),
  priority: z.number().int().min(1).max(3).default(2),
});

const taskPatchSchema = z
  .object({
    phase: z.enum(PHASES),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000),
    acceptance_criteria: z.string().max(20_000),
    priority: z.number().int().min(1).max(3),
    status: z.enum(TASK_STATUSES),
  })
  .partial();

/** タスクと成果物 */
export function taskRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/projects/:id/tasks", (c) => c.json(store.listTasks(requireProject(store, c.req.param("id")).id)));

  app.post("/api/projects/:id/tasks", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const input = taskInputSchema.parse(await c.req.json());
    return c.json(store.createTask({ ...input, project_id: project.id, created_by: "user" }), 201);
  });

  app.patch("/api/tasks/:id", async (c) => {
    const task = requireTask(store, c.req.param("id"));
    return c.json(store.updateTask(task.id, taskPatchSchema.parse(await c.req.json())));
  });

  app.delete("/api/tasks/:id", (c) => {
    const task = requireTask(store, c.req.param("id"));
    store.deleteTask(task.id);
    return c.json({ ok: true });
  });

  // ---- 成果物 ----
  app.get("/api/projects/:id/artifacts", (c) => c.json(store.listArtifacts(requireProject(store, c.req.param("id")).id)));
  app.get("/api/artifacts/:id", (c) => c.json(requireArtifact(store, c.req.param("id"))));
}
