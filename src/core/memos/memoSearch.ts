// メモの中の文を探す（⌘K の「メモ内の文言」）。メモのフォルダは Git で管理していないこともあるので、ファイルを読んで探す
import fs from "node:fs/promises";
import path from "node:path";
import { memoExtensionOf } from "@shared/memo/kinds";
import type { MemoSearchHit, MemoSearchResult } from "@shared/types";

/** 返す数の上限・1 つのメモから返す数の上限・読むメモの大きさの上限（バイト）・行の文の長さの上限 */
const MAX_HITS = 100;
const MAX_HITS_PER_FILE = 5;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 160;
/** 長い行を切るとき、見つかった所の前に残す文字数 */
const LEAD_CHARS = 40;

/**
 * 1 つのメモの中で、query を含む行（大文字・小文字を区別しない。行の頭の空白は省く）。
 * 長い行は見つかった所が見えるように前後を切り（切ったところに「…」）、見つかった所の位置を返す
 */
export function findMemoLines(content: string, query: string, max = MAX_HITS_PER_FILE): Omit<MemoSearchHit, "project_id" | "path">[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const hits: Omit<MemoSearchHit, "project_id" | "path">[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length && hits.length < max; i++) {
    const line = lines[i].replace(/\r$/, "").trimStart();
    const lower = line.toLowerCase();
    // 小文字にすると長さが変わる文字があれば、そのままの行で探す（位置がずれないように）
    const at = lower.length === line.length ? lower.indexOf(needle) : line.indexOf(query);
    if (at < 0) continue;
    let start = 0;
    let text = line;
    if (line.length > MAX_TEXT_CHARS) {
      start = Math.max(0, Math.min(at - LEAD_CHARS, line.length - MAX_TEXT_CHARS));
      text = `${start > 0 ? "…" : ""}${line.slice(start, start + MAX_TEXT_CHARS)}${start + MAX_TEXT_CHARS < line.length ? "…" : ""}`;
    }
    const offset = at - start + (start > 0 ? 1 : 0);
    hits.push({ line: i + 1, text, match_start: offset, match_end: offset + query.length });
  }
  return hits;
}

/** いくつものメモのフォルダ（プロジェクトごと）のメモ（.md・.html）の中を探す。多すぎれば途中で切る */
export async function searchMemoTexts(sources: readonly { projectId: number; dir: string; files: readonly string[] }[], query: string): Promise<MemoSearchResult> {
  const result: MemoSearchResult = { hits: [], truncated: false };
  const q = query.trim();
  if (!q) return result;
  for (const source of sources) {
    for (const file of source.files) {
      if (!memoExtensionOf(file)) continue;
      const full = path.join(source.dir, file);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) continue;
      const content = await fs.readFile(full, "utf8").catch(() => "");
      for (const hit of findMemoLines(content, q)) {
        if (result.hits.length >= MAX_HITS) {
          result.truncated = true;
          return result;
        }
        result.hits.push({ project_id: source.projectId, path: file, ...hit });
      }
    }
  }
  return result;
}
