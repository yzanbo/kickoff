import type { Hono } from "hono";
import { z } from "zod";
import type { NoteAiPlanBody, NoteCreateBody, NoteDefaults, NoteDirUsers, NoteFromChatBody, NoteMoveBody, NoteWriteBody } from "@shared/types";
import { MAX_NOTE_SOURCE_CHARS } from "@/features/notes/core/notes";
import type { Store } from "@/foundation/core/db/store";
import type { NoteService } from "@/features/notes/core/notes";
import type { Runner } from "@/features/chat/core/index";
import type { UploadStore } from "@/features/attachments/core/index";
import { Conflict, Invalid, NotFound } from "@/foundation/core/errors";
import { jsonBody, queryOf } from "@/foundation/core/http/input";
import { lookups } from "@/foundation/core/http/lookups";
import { assetResponse, decodeSegments } from "@/foundation/core/http/assets";
import { folderPath, noteChatSchema, notePathSchema, optionalId, repoPath } from "@/foundation/core/http/schemas";
import { noteKindOf } from "@shared/notes/kinds";

/** HTML のノートのファイルを返す口の前置き（この後ろがノートのフォルダからの相対パス。画面の <base> と同じ） */
const ASSET_PREFIX = /^\/api\/projects\/[^/]+\/note\/file\//;

/** ノートの中身の上限（文字） */
const MAX_NOTE_CHARS = 5_000_000;

const writeSchema = z.object({ path: repoPath, content: z.string().max(MAX_NOTE_CHARS), base_hash: z.string().max(100).nullable() }) satisfies z.ZodType<NoteWriteBody>;
const createSchema = z.object({ path: repoPath, dir: z.boolean().optional(), content: z.string().max(MAX_NOTE_CHARS).optional() }) satisfies z.ZodType<NoteCreateBody>;
const moveSchema = z.object({ from: repoPath, to: repoPath }) satisfies z.ZodType<NoteMoveBody>;
const fromChatSchema = z.object({
  chat_id: z.number().int().positive(),
  text: z.string().trim().min(1).max(MAX_NOTE_SOURCE_CHARS),
  summarize: z.boolean(),
  merge: z.boolean().optional(),
  append_to: repoPath.nullable(),
  folder: repoPath.nullable(),
}) satisfies z.ZodType<NoteFromChatBody>;
const instructionText = z.string().trim().min(1).max(2000);
const aiPlanSchema = z.object({ instruction: instructionText.nullable() }) satisfies z.ZodType<NoteAiPlanBody>;

/**
 * プロジェクトのノート（一覧・中身・保存・作成・名前の変更と移動・ゴミ箱・チャットの文から作る・ノートのチャットを始める・AI のフォルダの整理案（動かさない））。
 * 保存先はプロジェクトの外（設定の notes_dir の下の、プロジェクトごとのフォルダ）。パスはノートのフォルダからの相対
 */
export function noteRoutes(app: Hono, { store, notes, runner, uploads }: { store: Store; notes: NoteService; runner: Runner; uploads: UploadStore }) {
  const { withProject } = lookups(store);

  // 設定の画面で、親フォルダをまだ選んでいないときに出す既定の場所
  app.get("/api/notes/defaults", (c) => c.json({ default_dir: notes.defaultDir } satisfies NoteDefaults));

  // そのフォルダをノートのフォルダにしているプロジェクト（except は自分。ほかのプロジェクトと被っていると画面で知らせる）
  app.get("/api/notes/users", (c) => {
    const q = z.object({ path: folderPath, except: optionalId }).parse({ path: c.req.query("path"), except: c.req.query("except") });
    return c.json({ project_ids: notes.usersOf(q.path, q.except).map((p) => p.id) } satisfies NoteDirUsers);
  });

  // すべてのプロジェクトのノートの中の文を探す（⌘K の「ノート内の文言」）
  app.get("/api/notes/search", async (c) => {
    const { q } = z.object({ q: z.string().max(200).default("") }).parse({ q: queryOf(c, "q") });
    return c.json(await notes.search(q));
  });

  app.get("/api/projects/:id/notes", withProject, async (c) => c.json(await notes.list(c.var.project)));

  app.get("/api/projects/:id/note", withProject, async (c) => {
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    return c.json(await notes.read(c.var.project, path));
  });

  // HTML のノートが相対パスで読むファイル（CSS・画像・フォント）。画面は HTML のノートの <base> をここに向ける。
  // 中身はそのまま返し、ページとして開かれても何も動かないよう sandbox の CSP を付ける
  app.get("/api/projects/:id/note/file/*", withProject, async (c) => {
    // c.req.path は Hono が解いたあとの形なので、URL の生のパスから 1 段ずつ解く（%2F・%25 を取り違えない）
    const raw = new URL(c.req.url).pathname.replace(ASSET_PREFIX, "");
    const file = repoPath.parse(decodeSegments(raw));
    return assetResponse(c, file, await notes.asset(c.var.project, file));
  });

  app.put("/api/projects/:id/note", withProject, async (c) => {
    const body = writeSchema.parse(await jsonBody(c));
    return c.json(await notes.write(c.var.project, body.path, body.content, body.base_hash));
  });

  app.post("/api/projects/:id/notes", withProject, async (c) => {
    const body = createSchema.parse(await jsonBody(c));
    return c.json(await notes.create(c.var.project, body.path, { dir: body.dir ?? false, content: body.content }), 201);
  });

  app.post("/api/projects/:id/notes/move", withProject, async (c) => {
    const body = moveSchema.parse(await jsonBody(c));
    return c.json(await notes.move(c.var.project, body.from, body.to));
  });

  app.delete("/api/projects/:id/note", withProject, async (c) => {
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    return c.json({ trash_id: await notes.trash(c.var.project, path) });
  });

  // ノートの写しを添付として保存する（入力欄にノートを添付したとき。送るときは写しと元のノートのパスを AI に伝える）
  app.post("/api/projects/:id/note/snapshot", withProject, async (c) => {
    const { path } = z.object({ path: notePathSchema }).parse(await jsonBody(c));
    const bytes = await notes.asset(c.var.project, path);
    const attachment = await uploads.saveNoteSnapshot({ note: path, mime: noteKindOf(path) === "html" ? "text/html" : "text/markdown", bytes });
    return c.json(attachment, 201);
  });

  // ノートのチャットを始める（ノートごとに 1 つ。続きはふつうのチャットと同じく /api/chats/:id/messages）。ノートがなければ 404、もうあれば 409
  app.post("/api/projects/:id/note/chat", withProject, async (c) => {
    const { project } = c.var;
    const input = noteChatSchema.parse(await jsonBody(c));
    await notes.read(project, input.path);
    if (store.chats.noteChats(project.id, input.path).some((chat) => chat.note_path === input.path && !chat.archived_at)) {
      throw new Conflict("このノートのチャットはもうあります");
    }
    const created = await runner.start({ projectId: project.id, prompt: input.text, options: input.options, attachments: input.attachments, notePath: input.path });
    return c.json(created, 201);
  });

  // フォルダの整理案を返す（動かさない）
  app.post("/api/projects/:id/notes/ai-plan", withProject, async (c) => {
    const body = aiPlanSchema.parse(await jsonBody(c));
    return c.json(await notes.aiPlan(c.var.project, body.instruction));
  });

  app.post("/api/projects/:id/notes/from-chat", withProject, async (c) => {
    const body = fromChatSchema.parse(await jsonBody(c));
    const chat = store.chats.get(body.chat_id);
    if (!chat) throw new NotFound("チャットが見つかりません");
    if (chat.project_id !== c.var.project.id) throw new Invalid("ほかのプロジェクトのチャットです");
    const ref = await notes.fromChat(c.var.project, chat, { text: body.text, summarize: body.summarize, merge: body.merge ?? false, appendTo: body.append_to, folder: body.folder });
    return c.json(ref, body.append_to ? 200 : 201);
  });
}
