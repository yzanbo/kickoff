import type { Hono } from "hono";
import { z } from "zod";
import { SNIPPET_LABEL_MAX, SNIPPET_TEXT_MAX, type NewSnippetBody, type SnippetPatch } from "@shared/types";
import type { ServerDeps } from "../server.js";
import { jsonBody } from "../input.js";
import { lookups, requireProject } from "../lookups.js";

/** 名前（前後の空白を削り、空なら null = 本文の 1 行目を見せる） */
const label = z
  .string()
  .trim()
  .max(SNIPPET_LABEL_MAX)
  .nullable()
  .transform((v) => v || null);
/** 本文（空白だけは不可。前後の改行・空白も入れたとおりに残す） */
const text = z
  .string()
  .max(SNIPPET_TEXT_MAX)
  .refine((v) => v.trim() !== "", "本文を入れてください");
const projectId = z.number().int().positive().nullable();

const newSnippetSchema = z.object({ project_id: projectId, label, text }) satisfies z.ZodType<NewSnippetBody>;
const snippetPatchSchema = z.object({ project_id: projectId.optional(), label: label.optional(), text: text.optional() }) satisfies z.ZodType<SnippetPatch>;

/**
 * 定型文（一覧は 1 つで、画面はすべてを読んでプロジェクトごとに絞る。作るは 201、変えたら変えたあとの定型文、
 * 並べ替えは並べたあとの一覧、削除は 204）。project_id はあるプロジェクトだけ（なければ 404）
 */
export function snippetRoutes(app: Hono, { store }: ServerDeps) {
  const { withSnippet } = lookups(store);

  app.get("/api/snippets", (c) => c.json(store.snippets.list()));

  app.post("/api/snippets", async (c) => {
    const body = newSnippetSchema.parse(await jsonBody(c));
    if (body.project_id !== null) requireProject(store, body.project_id);
    return c.json(store.snippets.create(body), 201);
  });

  app.put("/api/snippets/order", async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await jsonBody(c));
    return c.json(store.snippets.reorder(ids));
  });

  app.patch("/api/snippets/:id", withSnippet, async (c) => {
    const patch = snippetPatchSchema.parse(await jsonBody(c));
    if (patch.project_id != null) requireProject(store, patch.project_id);
    return c.json(store.snippets.update(c.var.snippet.id, patch));
  });

  app.delete("/api/snippets/:id", withSnippet, (c) => {
    store.snippets.delete(c.var.snippet.id);
    return c.body(null, 204);
  });
}
