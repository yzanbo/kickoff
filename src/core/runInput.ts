// チャットに送る指示の下ごしらえ（Runner から使う）: 名前の付け方・添付の書き添え
import type { ExecutionDeps } from "./runExecution.js";
import type { Attachment } from "./types.js";
import { withAttachmentNote } from "./uploads.js";

/** 最初の発言の 1 行目（60 文字まで）。AI が名前を付けるまでのチャット名 */
export function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

/** チャット名を AI に付けてもらう（ユーザーが名前を変えていなければ置き換える） */
export async function autoTitle({ store, providers }: ExecutionDeps, runId: number, text: string) {
  const run = store.getRun(runId);
  const provider = run ? providers[run.provider] : undefined;
  if (!run || !provider?.title || !text.trim()) return;
  try {
    const title = await provider.title(text);
    const latest = store.getRun(runId);
    if (title && latest && latest.title === run.title) store.updateRun(runId, { title });
  } catch {
    // 付けられなくても困らない（最初の発言のまま）
  }
}

/** 添付ファイルのパスをメッセージに書き添える（エージェントは Read ツールで読む） */
export async function promptWithAttachments({ uploads }: ExecutionDeps, text: string, attachments: Attachment[]): Promise<string> {
  if (attachments.length === 0 || !uploads) return text;
  const files = [];
  for (const attachment of attachments) {
    const resolved = await uploads.resolve(attachment.id);
    if (resolved) files.push({ path: resolved.path, attachment });
  }
  return withAttachmentNote(text, files);
}
