import path from "node:path";
import type { Hono } from "hono";
import { z } from "zod";
import type { MemoAiPlanBody, MemoCreateBody, MemoDefaults, MemoDirUsers, MemoFromChatBody, MemoMoveBody, MemoWriteBody } from "@shared/types";
import { MAX_MEMO_SOURCE_CHARS } from "../../memos/memos.js";
import type { ServerDeps } from "../server.js";
import { Conflict, Invalid, NotFound } from "../errors.js";
import { jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { folderPath, memoChatSchema, optionalId, repoPath } from "./schemas.js";

/** HTML のメモが読むファイルの種類（拡張子 → Content-Type。ほかは application/octet-stream） */
const ASSET_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

/** HTML のメモのファイルを返す口の前置き（この後ろがメモのフォルダからの相対パス。画面の <base> と同じ） */
const ASSET_PREFIX = /^\/api\/projects\/[^/]+\/memo\/file\//;

/** URL のパスを 1 段ずつ解く（解けなければ 400。段の中の / は許さない） */
function decodeSegments(raw: string): string {
  try {
    const parts = raw.split("/").map(decodeURIComponent);
    if (parts.some((p) => p.includes("/"))) throw new Error();
    return parts.join("/");
  } catch {
    throw new Invalid("パスが正しくありません");
  }
}

/** メモの中身の上限（文字） */
const MAX_MEMO_CHARS = 5_000_000;

const writeSchema = z.object({ path: repoPath, content: z.string().max(MAX_MEMO_CHARS), base_hash: z.string().max(100).nullable() }) satisfies z.ZodType<MemoWriteBody>;
const createSchema = z.object({ path: repoPath, dir: z.boolean().optional(), content: z.string().max(MAX_MEMO_CHARS).optional() }) satisfies z.ZodType<MemoCreateBody>;
const moveSchema = z.object({ from: repoPath, to: repoPath }) satisfies z.ZodType<MemoMoveBody>;
const fromChatSchema = z.object({
  chat_id: z.number().int().positive(),
  text: z.string().trim().min(1).max(MAX_MEMO_SOURCE_CHARS),
  summarize: z.boolean(),
  merge: z.boolean().optional(),
  append_to: repoPath.nullable(),
  folder: repoPath.nullable(),
}) satisfies z.ZodType<MemoFromChatBody>;
const instructionText = z.string().trim().min(1).max(2000);
const aiPlanSchema = z.object({ instruction: instructionText.nullable() }) satisfies z.ZodType<MemoAiPlanBody>;

/**
 * プロジェクトのメモ（一覧・中身・保存・作成・名前の変更と移動・ゴミ箱・チャットの文から作る・メモのチャットを始める・AI のフォルダの整理案（動かさない））。
 * 保存先はプロジェクトの外（設定の memos_dir の下の、プロジェクトごとのフォルダ）。パスはメモのフォルダからの相対
 */
export function memoRoutes(app: Hono, { store, memos, runner }: ServerDeps) {
  const { withProject } = lookups(store);

  // 設定の画面で、親フォルダをまだ選んでいないときに出す既定の場所
  app.get("/api/memos/defaults", (c) => c.json({ default_dir: memos.defaultDir } satisfies MemoDefaults));

  // そのフォルダをメモのフォルダにしているプロジェクト（except は自分。ほかのプロジェクトと被っていると画面で知らせる）
  app.get("/api/memos/users", (c) => {
    const q = z.object({ path: folderPath, except: optionalId }).parse({ path: c.req.query("path"), except: c.req.query("except") });
    return c.json({ project_ids: memos.usersOf(q.path, q.except).map((p) => p.id) } satisfies MemoDirUsers);
  });

  // すべてのプロジェクトのメモの中の文を探す（⌘K の「メモ内の文言」）
  app.get("/api/memos/search", async (c) => {
    const { q } = z.object({ q: z.string().max(200).default("") }).parse({ q: queryOf(c, "q") });
    return c.json(await memos.search(q));
  });

  app.get("/api/projects/:id/memos", withProject, async (c) => c.json(await memos.list(c.var.project)));

  app.get("/api/projects/:id/memo", withProject, async (c) => {
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    return c.json(await memos.read(c.var.project, path));
  });

  // HTML のメモが相対パスで読むファイル（CSS・画像・フォント）。画面は HTML のメモの <base> をここに向ける。
  // 中身はそのまま返し、ページとして開かれても何も動かないよう sandbox の CSP を付ける
  app.get("/api/projects/:id/memo/file/*", withProject, async (c) => {
    // c.req.path は Hono が解いたあとの形なので、URL の生のパスから 1 段ずつ解く（%2F・%25 を取り違えない）
    const raw = new URL(c.req.url).pathname.replace(ASSET_PREFIX, "");
    const file = repoPath.parse(decodeSegments(raw));
    const data = await memos.asset(c.var.project, file);
    const ext = path.posix.extname(file).toLowerCase();
    return c.body(new Uint8Array(data), 200, {
      "Content-Type": ASSET_TYPES[ext] ?? "application/octet-stream",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    });
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

  // メモのチャットを始める（メモごとに 1 つ。続きはふつうのチャットと同じく /api/chats/:id/messages）。メモがなければ 404、もうあれば 409
  app.post("/api/projects/:id/memo/chat", withProject, async (c) => {
    const { project } = c.var;
    const input = memoChatSchema.parse(await jsonBody(c));
    await memos.read(project, input.path);
    if (store.chats.memoChats(project.id, input.path).some((chat) => chat.memo_path === input.path && !chat.archived_at)) {
      throw new Conflict("このメモのチャットはもうあります");
    }
    const created = await runner.start({ projectId: project.id, prompt: input.text, options: input.options, attachments: input.attachments, memoPath: input.path });
    return c.json(created, 201);
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
    const ref = await memos.fromChat(c.var.project, chat, { text: body.text, summarize: body.summarize, merge: body.merge ?? false, appendTo: body.append_to, folder: body.folder });
    return c.json(ref, body.append_to ? 200 : 201);
  });
}
