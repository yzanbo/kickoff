import fs from "node:fs";
import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { TOOL_IMAGE_MTIME_HEADER } from "@shared/chat/toolImage";
import type { CaptureBody } from "@shared/types";
import { readToolImage } from "../../chat/toolImage.js";
import { chatTranscript, transcriptFileName } from "../../chat/transcript.js";
import { workdirOf } from "../../chat/workdir.js";
import { Invalid, NotFound } from "../errors.js";
import { lookups, requireProject } from "../lookups.js";
import { jsonBody } from "../input.js";
import { attachmentSourceSchema } from "./schemas.js";

/** 「AI に渡す」で取る中身（文字数は切る前の上限。保存するときに添付の上限まで切る） */
const captureSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().max(200).default("text/markdown"),
  text: z.string().max(200_000_000),
  source: attachmentSourceSchema,
  tail_share: z.number().min(0).max(1).optional(),
}) satisfies z.ZodType<CaptureBody>;

/** 添付ファイル（受け取り・画面での表示）と、ツールの結果の画像の表示 */
export function uploadRoutes(app: Hono, { uploads, store, memos }: ServerDeps) {
  const { withChat } = lookups(store);

  // 別のチャットのやり取りを Markdown の記録にして、添付ファイルとして保存する（いまのチャットに添えて、AI に読ませる）
  app.post("/api/chats/:id/transcript", withChat, async (c) => {
    const { chat } = c.var;
    const project = requireProject(store, chat.project_id);
    const text = chatTranscript(chat, project, store.events.list(chat.id));
    const attachment = await uploads.save({ name: transcriptFileName(chat), type: "text/markdown", bytes: new TextEncoder().encode(text) });
    return c.json(attachment, 201);
  });

  // 「AI に渡す」で押したときの中身を添付として保存する（鍵らしい値を伏せ、大きすぎれば頭と終わりを残して切る。入力欄の札になる）
  app.post("/api/captures", async (c) => {
    const body = captureSchema.parse(await jsonBody(c));
    return c.json(await uploads.saveCapture({ name: body.name, mime: body.mime, text: body.text, source: body.source, tailShare: body.tail_share }), 201);
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
  // 読めるのはチャットの作業場所・本体・添付の保存先・メモのフォルダの中の画像だけ。ページとして開かれても何も動かないよう sandbox の CSP を付ける
  app.get("/api/chats/:id/tool-image", withChat, async (c) => {
    const { chat } = c.var;
    const { path } = z.object({ path: z.string().min(1).max(4096) }).parse({ path: c.req.query("path") });
    const project = requireProject(store, chat.project_id);
    const image = await readToolImage(path, [workdirOf(chat, project), project.repo_path, uploads.dir, memos.dirOf(project)]);
    return c.body(new Uint8Array(image.data), 200, {
      "content-type": image.type,
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
      "cache-control": "no-cache",
      [TOOL_IMAGE_MTIME_HEADER]: String(image.mtimeMs),
    });
  });
}
