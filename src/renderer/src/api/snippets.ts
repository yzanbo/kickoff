import type { NewSnippetBody, Snippet, SnippetPatch } from "@shared/types";
import { request } from "./http";

/** 定型文（コアの routes/snippets.ts）。一覧はすべて（プロジェクトごとに絞るのは画面）。並べ替えは、並べたあとのすべての定型文が返る */
export const snippetsApi = {
  snippets: () => request<Snippet[]>("GET", "/api/snippets"),
  createSnippet: (body: NewSnippetBody) => request<Snippet>("POST", "/api/snippets", body),
  updateSnippet: (id: number, patch: SnippetPatch) => request<Snippet>("PATCH", `/api/snippets/${id}`, patch),
  reorderSnippets: (ids: number[]) => request<Snippet[]>("PUT", "/api/snippets/order", { ids }),
  deleteSnippet: (id: number) => request<void>("DELETE", `/api/snippets/${id}`),
};
