import type { DatabaseSync } from "node:sqlite";
import type { NewSnippetBody, Snippet, SnippetPatch } from "@shared/snippets/types";
import type { Notify } from "@/foundation/core/db/common";
import { snippetsTable } from "@/features/snippets/core/schema";


/**
 * 定型文（snippets の表）。一覧は 1 つで、1 件ずつ使える範囲（共通 = project_id が null / そのプロジェクトだけ）を持つ。
 * 並び順 position はすべての定型文で 1 つの並び（新しいものは最後）。
 * ゴミ箱のプロジェクトだけの定型文は出さない（プロジェクトごとゴミ箱にある間は、ふだんの画面から外す。戻すとまた出る。trashedProjects は projects の店から）
 */
export function createSnippetStore(db: DatabaseSync, onChange: Notify, trashedProjects: () => Set<number>) {
  const shown = (s: Snippet, trashed = trashedProjects()) => s.project_id === null || !trashed.has(s.project_id);
  const rows = snippetsTable.on(db, (change) => {
    if (change.kind === "delete") onChange({ type: "snippet_deleted", id: Number(change.id) });
    else if (shown(change.row)) onChange({ type: "snippet", snippet: change.row });
  });
  const list = (): Snippet[] => {
    const trashed = trashedProjects();
    return rows.list().filter((s) => shown(s, trashed));
  };
  return {
    get: (id: number): Snippet | undefined => rows.get(id),
    list,
    create: (body: NewSnippetBody): Snippet => rows.insert({ project_id: body.project_id, label: body.label, text: body.text }),
    /** 書いた項目だけ変える（project_id の null は共通にする） */
    update: (id: number, patch: SnippetPatch): Snippet => rows.update(id, { project_id: patch.project_id, label: patch.label, text: patch.text }),
    /** ids の順に並べ直す（書いていない定型文は、いまの順のまま後ろに続ける） */
    reorder(ids: number[]): Snippet[] {
      rows.reorder(ids);
      return list();
    },
    delete(id: number) {
      rows.remove(id);
    },
  };
}
