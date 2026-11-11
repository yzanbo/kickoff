import { DB_MEMO_DIR, dbMemoTemplate, suggestDbMemoName } from "@shared/database/dbFailure";
import { errorMessage } from "@shared/errors";
import { safeMemoName } from "@shared/memo/names";
import type { DbConnection, MemoEntry } from "@shared/types";
import { api } from "@/api";
import { ApiError } from "@/api/http";
import { dbConnectionsStore } from "@/stores/dbConnections";
import { alertDialog, confirmDialog, promptDialog } from "@/ui/dialogs";

// 接続の手順メモ（要件 5.12 の段階 2）: メモのフォルダの DB/ の下のメモを、つなぎ方（経路）ごとに 1 つ作り、いくつもの接続で使う

/**
 * 手順メモを作って接続に結ぶ（名前はつなぎ方の名前をすすめる。ひな形の 4 つの見出しを入れる）。同じ名前のメモがあれば、それを使うか聞く。
 * 結んだメモのパス、やめた・作れなければ null
 */
export async function createConnectionMemo(projectId: number, c: DbConnection): Promise<string | null> {
  const name = (
    await promptDialog({
      title: "手順メモを作る",
      message: `つなぐ前にやること・つながらないときの直し方を残すメモです。メモのフォルダの「${DB_MEMO_DIR}/」の下に作ります。つなぎ方（経路）ごとに 1 つにすると、同じ道を通るほかの接続でも使えます。`,
      label: "メモの名前",
      initial: suggestDbMemoName(c),
      confirmLabel: "作る",
    })
  )?.trim();
  if (!name) return null;
  const path = `${DB_MEMO_DIR}/${safeMemoName(name)}.md`;
  try {
    await api.createMemo(projectId, path, { content: dbMemoTemplate(name, new Date().toLocaleDateString("sv-SE")) });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409)) {
      await alertDialog("手順メモを作れませんでした", errorMessage(e));
      return null;
    }
    const use = await confirmDialog({ title: "同じ名前のメモがあります", message: `「${path}」をこの接続の手順メモにしますか？`, confirmLabel: "このメモを使う" });
    if (!use) return null;
  }
  return linkConnectionMemo(projectId, c, path);
}

/** 接続の手順メモを選び直す（null で外す）。結んだパスを返す */
export async function linkConnectionMemo(projectId: number, c: DbConnection, path: string | null): Promise<string | null> {
  try {
    await api.updateDbConnection(projectId, c.id, { memo_path: path });
    dbConnectionsStore.invalidate(projectId);
    return path;
  } catch (e) {
    await alertDialog("手順メモを結べませんでした", errorMessage(e));
    return null;
  }
}

/** 手順メモに選べるメモ（Markdown・HTML。DB/ の下を先に） */
export function memoChoices(entries: MemoEntry[]): string[] {
  const files = entries.filter((e) => !e.dir && /\.(md|markdown|html?)$/i.test(e.path)).map((e) => e.path);
  const inDb = (p: string) => p.startsWith(`${DB_MEMO_DIR}/`);
  return [...files.filter(inDb), ...files.filter((p) => !inDb(p))];
}
