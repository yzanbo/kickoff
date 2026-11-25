// 定型文の操作（作る・変える・並べ替える・消す）。応答はすぐ店に入れ、知らせを待たずに画面をそろえる
import type { NewSnippetBody, Snippet, SnippetPatch } from "@shared/snippets/types";
import { snippetLabel } from "@shared/snippets/snippets";
import { reduceSnippets, snippetsStore } from "@/features/snippets/ui/store";
import { confirm } from "@/foundation/ui/kit/ask";
import { reduceBy } from "@/foundation/ui/store";
import { snippetsApi } from "./api";

export async function createSnippet(body: NewSnippetBody): Promise<Snippet> {
  const snippet = await snippetsApi("POST /api/snippets", { body });
  snippetsStore.update((list) => reduceBy(reduceSnippets, list, { type: "snippet", snippet }));
  return snippet;
}

export async function updateSnippet(id: number, patch: SnippetPatch): Promise<Snippet> {
  const snippet = await snippetsApi("PATCH /api/snippets/:snippetId", { params: { snippetId: id }, body: patch });
  snippetsStore.update((list) => reduceBy(reduceSnippets, list, { type: "snippet", snippet }));
  return snippet;
}

export async function reorderSnippets(ids: number[]) {
  snippetsStore.set(await snippetsApi("PUT /api/snippets/order", { body: { ids } }));
}

/** 確かめてから消す（消したら true） */
export async function confirmDeleteSnippet(snippet: Snippet): Promise<boolean> {
  const ok = await confirm({
    title: `定型文「${snippetLabel(snippet)}」を削除しますか？`,
    message: snippet.project_id === null ? "すべてのプロジェクトの定型文なので、どのプロジェクト（共通のチャットも）の帯からも消えます。" : undefined,
    confirmLabel: "削除",
    danger: true,
  });
  if (!ok) return false;
  await snippetsApi("DELETE /api/snippets/:snippetId", { params: { snippetId: snippet.id } });
  snippetsStore.update((list) => reduceBy(reduceSnippets, list, { type: "snippet_deleted", id: snippet.id }));
  return true;
}
