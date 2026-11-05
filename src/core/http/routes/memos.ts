import type { Hono } from "hono";
import { z } from "zod";
import type { MemoAiPlanBody, MemoChatBody, MemoCreateBody, MemoDefaults, MemoFromChatBody, MemoMoveBody, MemoWriteBody } from "@shared/types";
import { MAX_MEMO_AI_CHARS } from "../../memos/memoAi.js";
import { MAX_MEMO_SOURCE_CHARS } from "../../memos/memos.js";
import type { ServerDeps } from "../server.js";
import { Invalid, NotFound } from "../errors.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { repoPath } from "./schemas.js";

/** メモの中身の上限（文字） */
const MAX_MEMO_CHARS = 5_000_000;

const writeSchema = z.object({ path: repoPath, content: z.string().max(MAX_MEMO_CHARS), base_hash: z.string().max(100).nullable() }) satisfies z.ZodType<MemoWriteBody>;
const createSchema = z.object({ path: repoPath, dir: z.boolean().optional(), content: z.string().max(MAX_MEMO_CHARS).optional() }) satisfies z.ZodType<MemoCreateBody>;
const moveSchema = z.object({ from: repoPath, to: repoPath }) satisfies z.ZodType<MemoMoveBody>;
const fromChatSchema = z.object({
  chat_id: z.number().int().positive(),
  text: z.string().trim().min(1).max(MAX_MEMO_SOURCE_CHARS),
  summarize: z.boolean(),
  append_to: repoPath.nullable(),
  folder: repoPath.nullable(),
}) satisfies z.ZodType<MemoFromChatBody>;
const instructionText = z.string().trim().min(1).max(2000);
const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(MAX_MEMO_AI_CHARS) }))
    .min(1)
    .max(200),
  memo: z.string().max(MAX_MEMO_CHARS),
  selection: z.string().max(MAX_MEMO_AI_CHARS).nullable(),
}) satisfies z.ZodType<MemoChatBody>;
const aiPlanSchema = z.object({ instruction: instructionText.nullable() }) satisfies z.ZodType<MemoAiPlanBody>;

/**
 * プロジェクトのメモ（一覧・中身・保存・作成・名前の変更と移動・ゴミ箱・チャットの文から作る・AI（メモについての会話・フォルダの整理案。どちらも書き換えない））。
 * 保存先はプロジェクトの外（設定の memos_dir の下の、プロジェクトごとのフォルダ）。パスはメモのフォルダからの相対
 */
export function memoRoutes(app: Hono, { store, memos }: ServerDeps) {
  const { withProject } = lookups(store);

  // 設定の画面で、親フォルダをまだ選んでいないときに出す既定の場所
  app.get("/api/memos/defaults", (c) => c.json({ default_dir: memos.defaultDir } satisfies MemoDefaults));

  app.get("/api/projects/:id/memos", withProject, async (c) => c.json(await memos.list(c.var.project)));

  app.get("/api/projects/:id/memo", withProject, async (c) => {
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    return c.json(await memos.read(c.var.project, path));
  });

  app.put("/api/projects/:id/memo", withProject, async (c) => {
    const body = writeSchema.parse(await jsonBody(c));
    return c.json(await memos.write(c.var.project, body.path, body.content, body.base_hash));
  });

  app.post("/api/projects/:id/memos", withProject, async (c) => {
    const body = createSchema.parse(await jsonBody(c));
    return c.json(await memos.create(c.var.project, body.path, { dir: body.dir ?? false, content: body.content }), 201);
  });

  app.post("/api/projects/:id/memos/move", withProject, async (c) => {
    const body = moveSchema.parse(await jsonBody(c));
    return c.json(await memos.move(c.var.project, body.from, body.to));
  });

  app.delete("/api/projects/:id/memo", withProject, async (c) => {
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    await memos.trash(c.var.project, path);
    return c.body(null, 204);
  });

  // メモについての会話の返事（保存しない。変更の案を取り込むかは画面で決める）。最後の発言は利用者の空でない発言
  app.post("/api/projects/:id/memo/chat", withProject, async (c) => {
    const body = chatSchema.parse(await jsonBody(c));
    const last = body.messages.at(-1);
    if (last?.role !== "user" || !last.text.trim()) throw new Invalid("話しかける文がありません");
    return c.json(await memos.aiChat(c.var.project, body));
  });

  // フォルダの整理案を返す（動かさない）
  app.post("/api/projects/:id/memos/ai-plan", withProject, async (c) => {
    const body = aiPlanSchema.parse(await jsonBody(c));
    return c.json(await memos.aiPlan(c.var.project, body.instruction));
  });

  app.post("/api/projects/:id/memos/from-chat", withProject, async (c) => {
    const body = fromChatSchema.parse(await jsonBody(c));
    const chat = store.chats.get(body.chat_id);
    if (!chat) throw new NotFound("チャットが見つかりません");
    if (chat.project_id !== c.var.project.id) throw new Invalid("ほかのプロジェクトのチャットです");
    const ref = await memos.fromChat(c.var.project, chat, { text: body.text, summarize: body.summarize, appendTo: body.append_to, folder: body.folder });
    return c.json(ref, body.append_to ? 200 : 201);
  });
}
