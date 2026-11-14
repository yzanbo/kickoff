import type { DatabaseSync } from "node:sqlite";
import type { NewSnippetBody, Snippet, SnippetPatch } from "@shared/types";
import { NOW } from "./schema.js";
import { updateRow, type Notify } from "./common.js";

const COLUMNS = ["project_id", "label", "text"] as const;

/**
 * 定型文（snippets の表）。一覧は 1 つで、1 件ずつ使える範囲（共通 = project_id が null / そのプロジェクトだけ）を持つ。
 * 並び順 position はすべての定型文で 1 つの並び（新しいものは最後）
 */
export function createSnippetStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Snippet | undefined => db.prepare("SELECT * FROM snippets WHERE id = ?").get(id) as unknown as Snippet | undefined;
  // ゴミ箱のプロジェクトだけの定型文は出さない（プロジェクトごとゴミ箱にある間は、ふだんの画面から外す。戻すとまた出る）
  const list = (): Snippet[] =>
    db
      .prepare("SELECT s.* FROM snippets s LEFT JOIN projects p ON p.id = s.project_id WHERE s.project_id IS NULL OR p.trashed_at IS NULL ORDER BY s.position, s.id")
      .all() as unknown as Snippet[];
  return {
    get,
    list,
    create(body: NewSnippetBody): Snippet {
      const { next } = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM snippets").get() as { next: number };
      const { lastInsertRowid } = db
        .prepare("INSERT INTO snippets (project_id, label, text, position) VALUES (?, ?, ?, ?)")
        .run(body.project_id, body.label, body.text, next);
      const snippet = get(Number(lastInsertRowid))!;
      onChange({ type: "snippet", snippet });
      return snippet;
    },
    /** 書いた項目だけ変える（project_id の null は共通にする） */
    update(id: number, patch: SnippetPatch): Snippet {
      updateRow(db, "snippets", id, { ...patch }, COLUMNS);
      db.prepare(`UPDATE snippets SET updated_at = ${NOW} WHERE id = ?`).run(id);
      const snippet = get(id)!;
      onChange({ type: "snippet", snippet });
      return snippet;
    },
    /** ids の順に並べ直す（書いていない定型文は、いまの順のまま後ろに続ける） */
    reorder(ids: number[]): Snippet[] {
      const known = new Set(list().map((s) => s.id));
      const head = ids.filter((id, i) => known.has(id) && ids.indexOf(id) === i);
      const rest = list()
        .map((s) => s.id)
        .filter((id) => !head.includes(id));
      const stmt = db.prepare("UPDATE snippets SET position = ? WHERE id = ?");
      [...head, ...rest].forEach((id, i) => stmt.run(i, id));
      const snippets = list();
      for (const snippet of snippets) onChange({ type: "snippet", snippet });
      return snippets;
    },
    delete(id: number) {
      if (!get(id)) return;
      db.prepare("DELETE FROM snippets WHERE id = ?").run(id);
      onChange({ type: "snippet_deleted", id });
    },
  };
}
