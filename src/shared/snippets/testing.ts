// 定型文のテストのデータ（テストからだけ使う）
import type { Snippet } from "@shared/snippets/types";
import { TEST_TIME } from "@shared/foundation/testing/data";

/** 定型文（共通・名前なし・本文「本文<id>」・並び順は id） */
export function makeSnippet(id: number, patch: Partial<Snippet> = {}): Snippet {
  return { id, project_id: null, label: null, text: `本文${id}`, position: id, created_at: TEST_TIME, updated_at: TEST_TIME, ...patch };
}
