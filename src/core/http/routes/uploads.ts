import fs from "node:fs";
import type { Hono } from "hono";
import type { ServerDeps } from "../server.js";
import { chatTranscript, transcriptFileName } from "../../chat/transcript.js";
import { Invalid, NotFound } from "../errors.js";
import { requireProject, requireChat } from "./http.js";

/** 添付ファイル（受け取り・画面での表示） */
export function uploadRoutes(app: Hono, { uploads, store }: ServerDeps) {
  // 別のチャットのやり取りを Markdown の記録にして、添付ファイルとして保存する（いまのチャットに添えて、AI に読ませる）
  app.post("/api/chats/:id/transcript", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const project = requireProject(store, String(chat.project_id));
    const text = chatTranscript(chat, project, store.events.list(chat.id));
    const attachment = await uploads.save({ name: transcriptFileName(chat), type: "text/markdown", bytes: new TextEncoder().encode(text) });
    return c.json(attachment, 201);
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
}
