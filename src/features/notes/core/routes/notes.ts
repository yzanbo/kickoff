// プロジェクトのノートの受け口（取り決めは @shared/notes/contract.ts。どれも端末にも開く）: 一覧・中身・保存・作成・名前の変更と移動・ゴミ箱・
// チャットの文から作る・ノートのチャットを始める・AI のフォルダの整理案（動かさない）。パスはノートのフォルダからの相対
import { z } from "zod";
import { notesContract } from "@shared/notes/contract";
import type { NoteAiPlanBody, NoteChatBody, NoteCreateBody, NoteFromChatBody, NoteMoveBody, NoteWriteBody } from "@shared/notes/api";
import { noteKindOf } from "@shared/notes/kinds";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { UploadStore } from "@/features/attachments/core/index";
import { Invalid } from "@/foundation/core/errors";
import { implement, type Param } from "@/foundation/core/http/implement";
import { assetResponse, decodeSegments } from "@/foundation/core/http/assets";
import { CONTENT_REQUIRED, hasContent, messageShape, notePathSchema } from "@/features/chat/core/index";
import { folderPath, optionalId, repoPath } from "@/foundation/core/http/zodParts";
import type { NoteDirs } from "@/features/notes/core/noteDir";
import type { NoteService } from "@/features/notes/core/service";
import { MAX_NOTE_SOURCE_CHARS, type createNoteAi } from "@/features/notes/core/noteAi";
import type { createNoteChat } from "@/features/notes/core/noteChat";

/** HTML のノートのファイルを返す口の前置き（この後ろがノートのフォルダからの相対パス。画面の <base> と同じ） */
const ASSET_PREFIX = /^\/api\/projects\/[^/]+\/note\/file\//;

/** ノートの中身の上限（文字） */
const MAX_NOTE_CHARS = 5_000_000;

const pathQuery = z.object({ path: repoPath });
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
const aiPlanSchema = z.object({ instruction: z.string().trim().min(1).max(2000).nullable() }) satisfies z.ZodType<NoteAiPlanBody>;
/** ノートのチャットの最初の指示（どのノートについてのチャットか） */
const noteChatSchema = z.object({ ...messageShape, path: repoPath }).refine(hasContent, CONTENT_REQUIRED) satisfies z.ZodType<NoteChatBody, unknown>;
/** * は受け口が URL の生のパスから読む（Hono が解いたあとの形だと %2F・%25 を取り違える） */
const rawRest: Param<string> = { parse: (raw) => raw };

export interface NoteRouteDeps {
  projectParam: Param<Project>;
  chatParam: Param<Chat>;
  dirs: NoteDirs;
  notes: NoteService;
  ai: ReturnType<typeof createNoteAi>;
  chat: ReturnType<typeof createNoteChat>;
  uploads: UploadStore;
}

export function noteRoutes({ projectParam, chatParam, dirs, notes, ai, chat, uploads }: NoteRouteDeps) {
  return implement(notesContract, {
    context: { projectId: projectParam, "*": rawRest },
    "GET /api/notes/defaults": { run: () => ({ default_dir: dirs.defaultDir }) },
    "GET /api/notes/users": {
      query: z.object({ path: folderPath, except: optionalId }),
      run: ({ query }) => ({ project_ids: dirs.usersOf(query.path, query.except).map((p) => p.id) }),
    },
    "GET /api/notes/search": { query: z.object({ q: z.string().max(200).default("") }), run: ({ query }) => notes.search(query.q) },
    "GET /api/projects/:projectId/notes": { run: ({ projectId: project }) => notes.list(project) },
    "GET /api/projects/:projectId/note": { query: pathQuery, run: ({ projectId: project, query }) => notes.read(project, query.path) },
    // 中身はそのまま返し、ページとして開かれても何も動かないよう sandbox の CSP を付ける
    "GET /api/projects/:projectId/note/file/*": {
      run: async ({ projectId: project, raw: c }) => {
        const file = repoPath.parse(decodeSegments(new URL(c.req.url).pathname.replace(ASSET_PREFIX, "")));
        return assetResponse(c, file, await notes.asset(project, file));
      },
    },
    "PUT /api/projects/:projectId/note": { body: writeSchema, run: ({ projectId: project, body }) => notes.write(project, body.path, body.content, body.base_hash) },
    "POST /api/projects/:projectId/notes": { body: createSchema, run: ({ projectId: project, body }) => notes.create(project, body.path, { dir: body.dir ?? false, content: body.content }) },
    "POST /api/projects/:projectId/notes/move": { body: moveSchema, run: ({ projectId: project, body }) => notes.move(project, body.from, body.to) },
    "DELETE /api/projects/:projectId/note": { query: pathQuery, run: async ({ projectId: project, query }) => ({ trash_id: await notes.trash(project, query.path) }) },
    // 送るときは写しと元のノートのパスを AI に伝える
    "POST /api/projects/:projectId/note/snapshot": {
      body: z.object({ path: notePathSchema }),
      run: async ({ projectId: project, body }) => {
        const bytes = await notes.asset(project, body.path);
        return uploads.saveNoteSnapshot({ note: body.path, mime: noteKindOf(body.path) === "html" ? "text/html" : "text/markdown", bytes });
      },
    },
    "POST /api/projects/:projectId/note/chat": { body: noteChatSchema, run: ({ projectId: project, body }) => chat.startChat(project, body) },
    "POST /api/projects/:projectId/notes/ai-plan": { body: aiPlanSchema, run: ({ projectId: project, body }) => ai.aiPlan(project, body.instruction) },
    // 足したら 200（alsoStatus）、作ったら 201
    "POST /api/projects/:projectId/notes/from-chat": {
      body: fromChatSchema,
      run: async ({ projectId: project, body, useAlsoStatus }) => {
        const from = await chatParam.parse(String(body.chat_id));
        if (from.project_id !== project.id) throw new Invalid("ほかのプロジェクトのチャットです");
        const ref = await ai.fromChat(project, from, { text: body.text, summarize: body.summarize, merge: body.merge ?? false, appendTo: body.append_to, folder: body.folder });
        if (body.append_to) useAlsoStatus();
        return ref;
      },
    },
  });
}
