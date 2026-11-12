// SQL のタブの「AI に頼む」: 頼みの文とスキーマのテーブル・列の名前から、1 回だけ AI に SQL を書いてもらう頼み方と答えの読み方（中身の値は渡さない）
import type { DbEngine } from "@shared/types";
import { DB_ENGINE_LABELS } from "@shared/types";
import type { DbOutlineTable } from "./protocol.js";

/** 頼みに入れるテーブルと列の名前の上限（文字数。超えたら後ろのテーブルを省く） */
export const SQL_ASSIST_SCHEMA_CHARS = 30_000;

/** AI に SQL を書いてもらう頼み方（構造の名前と、いま書いている SQL と頼み。答えは SQL のコードの囲み 1 つだけにしてもらう） */
export function sqlAssistPrompt(input: { engine: DbEngine; tables: DbOutlineTable[]; request: string; current: string }): string {
  const lines: string[] = [];
  let used = 0;
  let omitted = 0;
  for (const t of input.tables) {
    const line = `- ${t.name}(${t.columns.join(", ")})`;
    if (used + line.length > SQL_ASSIST_SCHEMA_CHARS) {
      omitted++;
      continue;
    }
    lines.push(line);
    used += line.length + 1;
  }
  if (omitted > 0) lines.push(`（ほかに ${omitted} 個のテーブルを省きました）`);
  return [
    `${DB_ENGINE_LABELS[input.engine]} の SQL を書いてください。`,
    "答えは ```sql で始まるコードの囲み 1 つだけにし、説明は SQL の中に -- のコメントで短く書いてください。",
    "テーブルと列の名前は、下の一覧にあるものだけを使ってください。",
    "",
    "<テーブルと列>",
    lines.length > 0 ? lines.join("\n") : "（テーブルがありません）",
    "</テーブルと列>",
    ...(input.current.trim() ? ["", "<いまの SQL>", input.current.trim(), "</いまの SQL>"] : []),
    "",
    "<頼み>",
    input.request.trim(),
    "</頼み>",
  ].join("\n");
}

/** 答えから SQL を取り出す（コードの囲みがあれば最初の囲みの中、なければ全体。空なら空文字） */
export function parseSqlAnswer(answer: string): string {
  const m = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(answer);
  return (m ? m[1] : answer).trim();
}
