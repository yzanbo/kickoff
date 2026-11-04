import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Attachment } from "@shared/types";
import { Invalid } from "../http/errors.js";

/** 1 ファイルあたりの上限 */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/**
 * チャットの添付ファイル。データフォルダの uploads/<id>/<ファイル名> に保存し、
 * エージェントには Read ツールで読めるパスとして渡す（リポジトリには置かない）。
 */
export class UploadStore {
  constructor(readonly dir: string) {}

  async save(file: { name: string; type: string; bytes: Uint8Array }): Promise<Attachment> {
    if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Invalid(`ファイルが大きすぎます（上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB）: ${file.name}`);
    }
    const id = randomUUID();
    const name = safeFileName(file.name);
    const folder = path.join(this.dir, id);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, name), file.bytes);
    return { id, name, mime: file.type || "application/octet-stream", size: file.bytes.byteLength };
  }

  /** 保存済みの添付のパス（ID が不正・存在しなければ undefined） */
  async resolve(id: string): Promise<{ path: string; name: string } | undefined> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
    const folder = path.join(this.dir, id);
    const [name] = await fs.readdir(folder).catch(() => [] as string[]);
    return name ? { path: path.join(folder, name), name } : undefined;
  }
}

/** パス区切りや制御文字を取り除いたファイル名 */
export function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f/\\:]/g, "_").trim();
  return base && base !== "." && base !== ".." ? base.slice(0, 200) : "file";
}

/** エージェントへのメッセージに添付の案内を付け足す */
export function withAttachmentNote(text: string, files: { path: string; attachment: Attachment }[], heading = "添付ファイル（Read ツールで読めます）"): string {
  if (files.length === 0) return text;
  const lines = files.map(({ path: p, attachment: a }) => `- ${p}（${a.mime}, ${formatBytes(a.size)}）`);
  const note = `${heading}:\n${lines.join("\n")}`;
  return text.trim() ? `${text}\n\n${note}` : note;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 回答に添えた添付の見出し（回答の一部なので、読み飛ばさずに開いてもらう） */
const ANSWER_ATTACHMENT_HEADING = "回答に添えた添付ファイル（回答の一部です。Read ツールで開いて中身を確かめてから進めてください）";

/**
 * AI からの質問への回答に、質問ごとに添えた添付のパスを書き添える（回答は文字だけなので、エージェントは Read ツールで読む。
 * 見つからない添付は書かない）。複数選ぶ質問は、最後の答えに書き添える
 */
export async function answersWithAttachments(
  uploads: Pick<UploadStore, "resolve">,
  answers: Record<string, string | string[]>,
  attachments: Record<string, Attachment[]> | undefined,
): Promise<Record<string, string | string[]>> {
  if (!attachments) return answers;
  const result = { ...answers };
  for (const [question, list] of Object.entries(attachments)) {
    const files = [];
    for (const attachment of list) {
      const resolved = await uploads.resolve(attachment.id);
      if (resolved) files.push({ path: resolved.path, attachment });
    }
    if (files.length === 0) continue;
    const current = result[question];
    if (Array.isArray(current)) result[question] = [...current.slice(0, -1), withAttachmentNote(current.at(-1) ?? "", files, ANSWER_ATTACHMENT_HEADING)];
    else result[question] = withAttachmentNote(current ?? "", files, ANSWER_ATTACHMENT_HEADING);
  }
  return result;
}
