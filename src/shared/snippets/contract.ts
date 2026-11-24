// 定型文の取り決め（一覧は 1 つ。プロジェクトごとに絞るのは画面）。受け口は src/features/snippets/core/routes.ts
import { empty, route, type Contract } from "@shared/foundation/contract";
import type { NewSnippetBody, Snippet, SnippetPatch } from "./types";

export const snippetContract = {
  /** すべての定型文（ゴミ箱のプロジェクトだけのものは出さない） */
  "GET /api/snippets": route<never, Snippet[]>(),
  /** 作る（project_id があるプロジェクトだけ。なければ 404） */
  "POST /api/snippets": route<NewSnippetBody, Snippet>({ status: 201 }),
  /** ids の順に並べ直す（書いていないものは後ろに続ける。並べたあとのすべて） */
  "PUT /api/snippets/order": route<{ ids: number[] }, Snippet[]>(),
  /** 書いた項目だけ変える（変えたあとの定型文） */
  "PATCH /api/snippets/:snippetId": route<SnippetPatch, Snippet>(),
  /** 消す */
  "DELETE /api/snippets/:snippetId": empty(),
} as const satisfies Contract;
