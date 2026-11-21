// チャットの添付の口（chat の ChatAttachments）: 添付の保存先と、送る文に添付のパスを書き添える見出し
import fs from "node:fs/promises";
import path from "node:path";
import type { ChatAttachments } from "@/features/chat/core/index";
import { isInside } from "@/foundation/core/system/paths";
import { appendNote, CAPTURE_HEADING, captureLine, NOTE_SNAPSHOT_HEADING, noteSnapshotLine } from "./attachmentNotes";
import { withAttachmentNote, type UploadStore } from "./uploads";

/** 添付の置き場から、チャットの添付の口を作る */
export function chatAttachmentsOf(uploads: UploadStore): ChatAttachments {
  return {
    dir: uploads.dir,
    // ノートの写しと取ったものの見出しは、保存したときの記録（uploads.meta）から書く。見つからない添付・ノートは書かない
    async promptNote(text, attachments, noteDir) {
      const files = [];
      const snapshots: string[] = [];
      const captures: string[] = [];
      for (const attachment of attachments) {
        const resolved = await uploads.resolve(attachment.id);
        if (!resolved) continue;
        const saved = await uploads.meta(attachment.id);
        if (saved?.kind === "capture") captures.push(captureLine(resolved.path, saved));
        else if (saved?.kind === "note") snapshots.push(noteSnapshotLine(resolved.path, saved, noteDir ? await noteFile(noteDir, saved.note) : null));
        else files.push({ path: resolved.path, attachment });
      }
      return appendNote(appendNote(withAttachmentNote(text, files), NOTE_SNAPSHOT_HEADING, snapshots), CAPTURE_HEADING, captures);
    },
  };
}

/** ノートのフォルダの中のファイルの絶対パス（外を指す・ないなら null） */
async function noteFile(dir: string, note: string): Promise<string | null> {
  const file = path.join(dir, note);
  if (!isInside(dir, file) || file === dir) return null;
  return (await fs.stat(file).then((s) => s.isFile(), () => false)) ? file : null;
}
