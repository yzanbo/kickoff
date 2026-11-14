import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeAttachment } from "@shared/attachment/normalize";
import { formatSize, truncateText } from "@shared/attachment/truncate";
import { redactSecrets } from "@shared/secrets/redact";
import type { Attachment, AttachmentSource, CaptureAttachment, FileAttachment, MemoAttachment } from "@shared/types";
import { Invalid } from "../http/errors.js";

/** 1 ファイルあたりの上限 */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** 添付の記録（種類・出どころ・取った時刻など）を置くファイルの名前。添付のフォルダの中に置き、resolve は読み飛ばす */
const META_FILE = ".attachment.json";

/** ID の形（uuid） */
const isUploadId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

/**
 * チャットの添付ファイル。データフォルダの uploads/<id>/<ファイル名> に保存し、
 * エージェントには Read ツールで読めるパスとして渡す（リポジトリには置かない）。
 * 「AI に渡す」で取った中身（capture）とメモの写しは、同じフォルダに添付の記録（META_FILE）も置き、送るときの見出しはこの記録から書く
 */
export class UploadStore {
  constructor(readonly dir: string) {}

  async save(file: { name: string; type: string; bytes: Uint8Array }): Promise<FileAttachment> {
    const { id, name } = await this.write(file.name, file.bytes);
    return { kind: "file", id, name, mime: file.type || "application/octet-stream", size: file.bytes.byteLength };
  }

  /**
   * 「AI に渡す」で押したときの中身を保存する。鍵らしい値を伏せ、上限を超えれば頭と終わりを残して切る（tailShare: 終わりに回す割合。ログは多め）
   */
  async saveCapture(input: { name: string; mime: string; text: string; source: AttachmentSource; tailShare?: number }): Promise<CaptureAttachment> {
    const redacted = redactSecrets(input.text);
    const cut = truncateText(redacted.text, MAX_UPLOAD_BYTES, input.tailShare);
    const bytes = new TextEncoder().encode(cut.text);
    return this.storeCapture(input, bytes, { truncated: cut.truncated, original_size: cut.originalSize, redacted: redacted.count });
  }

  /** 「AI に渡す」で押したときの画像（ブラウザの画面など）を保存する。伏せも切りもしない（添付の上限を超えれば 400） */
  async saveCaptureImage(input: { name: string; mime: string; bytes: Uint8Array; source: AttachmentSource }): Promise<CaptureAttachment> {
    const size = input.bytes.byteLength;
    if (size === 0) throw new Invalid("画像が空です");
    if (size > MAX_UPLOAD_BYTES) throw new Invalid(`画像が大きすぎます（${formatSize(size)}。上限は ${formatSize(MAX_UPLOAD_BYTES)}）`);
    return this.storeCapture(input, input.bytes, { truncated: false, original_size: size, redacted: 0 });
  }

  /** 取ったものを保存し、添付の記録も置く */
  private async storeCapture(
    input: { name: string; mime: string; source: AttachmentSource },
    bytes: Uint8Array,
    marks: Pick<CaptureAttachment, "truncated" | "original_size" | "redacted">,
  ): Promise<CaptureAttachment> {
    const { id, name } = await this.write(input.name, bytes);
    const attachment: CaptureAttachment = { kind: "capture", id, name, mime: input.mime, size: bytes.byteLength, source: input.source, taken_at: new Date().toISOString(), ...marks };
    await this.writeMeta(attachment);
    return attachment;
  }

  /** メモの写しを保存する（付けたときの中身。memo はメモのフォルダからの相対パス） */
  async saveMemoSnapshot(input: { memo: string; mime: string; bytes: Uint8Array }): Promise<MemoAttachment> {
    const { id, name } = await this.write(path.basename(input.memo), input.bytes);
    const attachment: MemoAttachment = { kind: "memo", id, name, mime: input.mime, size: input.bytes.byteLength, memo: input.memo, taken_at: new Date().toISOString() };
    await this.writeMeta(attachment);
    return attachment;
  }

  /** before より前に保存した添付の ID（フォルダを作った時刻で見る。送らなかった添付の片付け） */
  async savedBefore(before: number): Promise<string[]> {
    const ids: string[] = [];
    for (const id of await fs.readdir(this.dir).catch(() => [] as string[])) {
      if (!isUploadId(id)) continue;
      const st = await fs.stat(path.join(this.dir, id)).catch(() => null);
      if (st?.isDirectory() && Math.min(st.birthtimeMs || st.mtimeMs, st.mtimeMs) < before) ids.push(id);
    }
    return ids;
  }

  /** 添付を消す（チャットを本当に消したあと・どこからも使われなくなったもの。ID が不正なら何もしない） */
  async remove(id: string): Promise<void> {
    if (isUploadId(id)) await fs.rm(path.join(this.dir, id), { recursive: true, force: true });
  }

  /** 保存済みの添付のパス（ID が不正・存在しなければ undefined。添付の記録は数えない） */
  async resolve(id: string): Promise<{ path: string; name: string } | undefined> {
    if (!isUploadId(id)) return undefined;
    const folder = path.join(this.dir, id);
    const name = (await fs.readdir(folder).catch(() => [] as string[])).find((n) => n !== META_FILE);
    return name ? { path: path.join(folder, name), name } : undefined;
  }

  /** 保存したときの添付の記録（capture・メモの写し。ほかの添付・読めなければ null） */
  async meta(id: string): Promise<Attachment | null> {
    if (!isUploadId(id)) return null;
    try {
      return normalizeAttachment(JSON.parse(await fs.readFile(path.join(this.dir, id, META_FILE), "utf8")));
    } catch {
      return null;
    }
  }

  private async write(fileName: string, bytes: Uint8Array): Promise<{ id: string; name: string }> {
    if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Invalid(`ファイルが大きすぎます（上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB）: ${fileName}`);
    const id = randomUUID();
    const name = safeFileName(fileName);
    const folder = path.join(this.dir, id);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, name), bytes);
    return { id, name };
  }

  private async writeMeta(attachment: Attachment) {
    await fs.writeFile(path.join(this.dir, attachment.id, META_FILE), JSON.stringify(attachment));
  }
}

/** パス区切りや制御文字を取り除いたファイル名（添付の記録と同じ名前は変える） */
export function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f/\\:]/g, "_").trim();
  if (base === META_FILE) return `_${base}`;
  return base && base !== "." && base !== ".." ? base.slice(0, 200) : "file";
}

/** エージェントへのメッセージに添付の案内を付け足す */
export function withAttachmentNote(text: string, files: { path: string; attachment: Attachment }[], heading = "添付ファイル（Read ツールで読めます）"): string {
  if (files.length === 0) return text;
  const lines = files.map(({ path: p, attachment: a }) => `- ${p}（${a.mime}, ${formatSize(a.size)}）`);
  const note = `${heading}:\n${lines.join("\n")}`;
  return text.trim() ? `${text}\n\n${note}` : note;
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
