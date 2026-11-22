import fs from "node:fs";
import nodePath from "node:path";
import type { Hono } from "hono";
import { z } from "zod";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import type { UploadStore } from "@/features/attachments/core/uploads";
import { TOOL_IMAGE_MTIME_HEADER } from "@shared/attachments/toolImage";
import type { CaptureBody } from "@shared/foundation/apiTypes";
import type { Project } from "@shared/projects/types";
import { readToolImage } from "@/features/attachments/core/toolImage";
import { chatTranscript, transcriptFileName } from "@/features/chat/core/transcript";
import { workdirOf } from "@/features/chat/core/workdir";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { lookups, requireProject } from "@/foundation/core/http/lookups";
import { jsonBody } from "@/foundation/core/http/input";
import { attachmentSourceSchema } from "@/foundation/core/http/schemas";

/** 「AI に渡す」で取る画像の形式（画面で大きく見られ、AI が Read で読めるもの） */
const CAPTURE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** 「AI に渡す」で取る中身（文字数は切る前の上限。保存するときに添付の上限まで切る）。文か画像のどちらか 1 つ */
const captureSchema = z
  .object({
    name: z.string().min(1).max(200),
    mime: z.string().max(200).default("text/markdown"),
    text: z.string().max(200_000_000).optional(),
    // 添付の上限（30MB）の base64 より少し長くまで受け、上限は保存するときに確かめる
    image_base64: z.string().max(45_000_000).optional(),
    source: attachmentSourceSchema,
    tail_share: z.number().min(0).max(1).optional(),
  })
  .refine((b) => (b.text === undefined) !== (b.image_base64 === undefined), "中身は text か image_base64 のどちらか 1 つで送ってください")
  .refine((b) => b.image_base64 === undefined || CAPTURE_IMAGE_TYPES.includes(b.mime), "画像の形式が対応していません") satisfies z.ZodType<CaptureBody>;

/** 添付ファイル（受け取り・画面での表示）と、ツールの結果の画像の表示 */
export function uploadRoutes(app: Hono, { uploads, store, imageDirs }: { uploads: UploadStore; store: Pick<ChatStoreDeps, "projects" | "chats" | "groups" | "events">; imageDirs: readonly ((project: Project) => string)[] }) {
  const { withChat } = lookups(store);

  // 別のチャットのやり取りを Markdown の記録にして、添付ファイルとして保存する（いまのチャットに添えて、AI に読ませる）
  app.post("/api/chats/:id/transcript", withChat, async (c) => {
    const { chat } = c.var;
    const project = requireProject(store, chat.project_id);
    const text = chatTranscript(chat, project, store.events.list(chat.id));
    const attachment = await uploads.save({ name: transcriptFileName(chat), type: "text/markdown", bytes: new TextEncoder().encode(text) });
    return c.json(attachment, 201);
  });

  // 「AI に渡す」で押したときの中身を添付として保存する（文は鍵らしい値を伏せ、大きすぎれば頭と終わりを残して切る。画像はそのまま。入力欄の札になる）
  app.post("/api/captures", async (c) => {
    const body = captureSchema.parse(await jsonBody(c));
    if (body.image_base64 !== undefined) {
      const bytes = new Uint8Array(Buffer.from(body.image_base64, "base64"));
      return c.json(await uploads.saveCaptureImage({ name: body.name, mime: body.mime, bytes, source: body.source }), 201);
    }
    return c.json(await uploads.saveCapture({ name: body.name, mime: body.mime, text: body.text ?? "", source: body.source, tailShare: body.tail_share }), 201);
  });

  app.post("/api/uploads", async (c) => {
    const body = await c.req.parseBody({ all: true });
    const files = [body.file].flat().filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new Invalid("ファイルがありません");
    const saved = [];
    for (const file of files) {
      saved.push(await uploads.save({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }));
    }
    return c.json(saved, 201);
  });

  // 画面での表示用（画像のサムネイルなど）
  app.get("/api/uploads/:id", async (c) => {
    const file = await uploads.resolve(c.req.param("id"));
    if (!file) throw new NotFound("ファイルが見つかりません");
    const data = await fs.promises.readFile(file.path);
    const mime = c.req.query("mime") ?? "application/octet-stream";
    // 画像と PDF 以外はダウンロードさせる（スクリプトを画面の権限で開かせない）
    const inline = /^image\/(png|jpeg|gif|webp)$|^application\/pdf$/.test(mime);
    return c.body(data, 200, {
      "content-type": inline ? mime : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
    });
  });

  // ツールの結果の画像（読むで読んだ画像。記録には画像を残さないので、呼び出しの入力のパスから、いまのファイルを返す）。
  // 読めるのはチャットの作業場所・本体・添付の保存先・ノートのフォルダの中の画像だけ。ページとして開かれても何も動かないよう sandbox の CSP を付ける
  app.get("/api/chats/:id/tool-image", withChat, async (c) => {
    const { chat } = c.var;
    const { path, at } = z
      .object({ path: z.string().min(1).max(4096), at: z.coerce.number().int().positive().optional() })
      .parse({ path: c.req.query("path"), at: c.req.query("at") });
    const project = requireProject(store, chat.project_id);
    // 作業場所を移したチャットでは、区切りより前の記録（at）の画像はそのときの作業場所から読み、移す前の作業場所も読める場所に入れる
    const moves = store.events.workplaceMoves(chat.id);
    const workdir = (at !== undefined ? moves.find((m) => m.id > at)?.data.from.dir : undefined) ?? workdirOf(chat, project);
    // 返答の Markdown の画像（`![](docs/a.png)`）は相対パスで来るので、チャットの作業場所から読む
    const file = nodePath.isAbsolute(path) ? path : nodePath.resolve(workdir, path);
    const pastDirs = moves.map((m) => m.data.from.dir);
    const image = await readToolImage(file, [workdir, workdirOf(chat, project), project.repo_path, uploads.dir, ...imageDirs.map((dirOf) => dirOf(project)), ...pastDirs]);
    return c.body(new Uint8Array(image.data), 200, {
      "content-type": image.type,
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
      "cache-control": "no-cache",
      [TOOL_IMAGE_MTIME_HEADER]: String(image.mtimeMs),
    });
  });
}
