// 置き場のフォルダの読み方: 中身の置き場所と、AI の kickoff-trash が置いたもの（<id>/origin・chat・at と item/<名前>。書く側は command.ts）
import fs from "node:fs/promises";
import path from "node:path";
import { isTrashId } from "./names";
import { readText } from "./trashFiles";

/** 置き場のフォルダの中で、中身を置くフォルダの名前 */
export const TRASH_ITEM_DIR = "item";

/** AI の kickoff-trash が途中で止まった（中身のない）置き場のフォルダを消すまで */
const STALE_INBOX_MS = 60 * 60 * 1000;

/** 置き場の中身（item/ の中のただ 1 つのもの。なければ null） */
export async function storedPathOf(dir: string, id: string): Promise<string | null> {
  const holder = path.join(dir, id, TRASH_ITEM_DIR);
  const names = await fs.readdir(holder).catch(() => [] as string[]);
  return names.length === 1 ? path.join(holder, names[0]) : null;
}

/** AI の kickoff-trash が置いたもの 1 つ（chatId は入れたチャットの ID の印。なければ null） */
export interface InboxEntry {
  id: string;
  origin: string;
  isDir: boolean;
  chatId: number | null;
  trashedAt: string;
}

/**
 * 覚え書きのない置き場のフォルダのうち origin のあるものを読む（known は覚え書きがあるか）。
 * 中身のないまま古くなったもの（途中で止まった）は消す
 */
export async function readInbox(dir: string, known: (id: string) => boolean, now: () => number): Promise<InboxEntry[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const out: InboxEntry[] = [];
  for (const id of names) {
    if (!isTrashId(id) || known(id)) continue;
    const folder = path.join(dir, id);
    const origin = await readText(path.join(folder, "origin"));
    const stored = await storedPathOf(dir, id);
    if (!origin || !stored) {
      const st = await fs.stat(folder).catch(() => null);
      if (st && now() - st.mtimeMs > STALE_INBOX_MS) await fs.rm(folder, { recursive: true, force: true });
      continue;
    }
    const chatText = await readText(path.join(folder, "chat"));
    const at = await readText(path.join(folder, "at"));
    const st = await fs.lstat(stored).catch(() => null);
    out.push({
      id,
      origin,
      isDir: st?.isDirectory() ?? false,
      chatId: chatText && /^\d+$/.test(chatText) ? Number(chatText) : null,
      trashedAt: at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date(now()).toISOString(),
    });
  }
  return out;
}
