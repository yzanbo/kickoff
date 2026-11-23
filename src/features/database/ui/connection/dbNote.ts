import { DB_NOTE_DIR, dbNoteTemplate, suggestDbNoteName } from "./dbFailure";
import { errorMessage } from "@shared/foundation/errors";
import { safeNoteName } from "@shared/notes/names";
import type { DbConnection } from "@shared/database/types";
import type { NoteEntry } from "@shared/notes/types";
import { api } from "@/foundation/ui/api";
import { dbApi, dbOne } from "@/features/database/ui/api";
import { ApiError } from "@/foundation/ui/api/http";
import { applyConnection } from "@/features/database/ui/state/connectionsStore";
import { alert, confirm, prompt } from "@/foundation/ui/kit/ask";

// 接続の手順ノート: ノートのフォルダの DB/ の下のノートを、つなぎ方（経路）ごとに 1 つ作り、いくつもの接続で使う

/**
 * 手順ノートを作って接続に結ぶ（名前はつなぎ方の名前をすすめる。ひな形の 4 つの見出しを入れる）。同じ名前のノートがあれば、それを使うか聞く。
 * 結んだノートのパス、やめた・作れなければ null
 */
export async function createConnectionNote(projectId: number, c: DbConnection): Promise<string | null> {
  const path = await createDbNoteFile(projectId, c, "この接続");
  return path ? linkConnectionNote(projectId, c, path) : null;
}

/**
 * 手順ノートのファイルだけを作る（接続のダイアログの「新しく作る…」。保存する前の接続にも使えるよう、結ぶのは呼ぶ側）。
 * 名前は c のつなぎ方からすすめる。同じ名前のノートがあれば、それを使うか聞く（target は確かめの文の「〜の手順ノートにしますか」）。作った・使うノートのパス、やめたら null
 */
export async function createDbNoteFile(projectId: number, c: Pick<DbConnection, "engine" | "environment" | "host">, target: string): Promise<string | null> {
  const name = (
    await prompt({
      title: "手順ノートを作る",
      message: `つなぐ前にやること・つながらないときの直し方を残すノートです。ノートのフォルダの「${DB_NOTE_DIR}/」の下に作ります。つなぎ方（経路）ごとに 1 つにすると、同じ道を通るほかの接続でも使えます。`,
      label: "ノートの名前",
      initial: suggestDbNoteName(c),
      confirmLabel: "作る",
    }).then((r) => r?.value ?? null)
  )?.trim();
  if (!name) return null;
  const path = `${DB_NOTE_DIR}/${safeNoteName(name)}.md`;
  try {
    await api.createNote(projectId, path, { content: dbNoteTemplate(name, new Date().toLocaleDateString("sv-SE")) });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409)) {
      await alert("手順ノートを作れませんでした", errorMessage(e));
      return null;
    }
    const use = await confirm({ title: "同じ名前のノートがあります", message: `「${path}」を${target}の手順ノートにしますか？`, confirmLabel: "このノートを使う" });
    if (!use) return null;
  }
  return path;
}

/** 接続の手順ノートを選び直す（null で外す）。結んだパスを返す */
async function linkConnectionNote(projectId: number, c: DbConnection, path: string | null): Promise<string | null> {
  try {
    applyConnection(await dbApi("PATCH /api/projects/:projectId/db-connections/:connectionId", { ...dbOne(projectId, c.id), body: { note_path: path } }));
    return path;
  } catch (e) {
    await alert("手順ノートを結べませんでした", errorMessage(e));
    return null;
  }
}

/** 手順ノートに選べるノート（Markdown・HTML。DB/ の下を先に） */
export function noteChoices(entries: NoteEntry[]): string[] {
  const files = entries.filter((e) => !e.dir && /\.(md|markdown|html?)$/i.test(e.path)).map((e) => e.path);
  const inDb = (p: string) => p.startsWith(`${DB_NOTE_DIR}/`);
  return [...files.filter(inDb), ...files.filter((p) => !inDb(p))];
}
