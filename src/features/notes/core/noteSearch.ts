// ノートの中の文を探す（⌘K の「ノート内の文言」）。ノートのフォルダは Git で管理していないこともあるので、ファイルを読んで探す
import fs from "node:fs/promises";
import path from "node:path";
import { noteExtensionOf } from "@shared/notes/kinds";
import type { NoteSearchHit, NoteSearchResult } from "@shared/notes/types";

/** 返す数の上限・1 つのノートから返す数の上限・読むノートの大きさの上限（バイト）・行の文の長さの上限 */
const MAX_HITS = 100;
const MAX_HITS_PER_FILE = 5;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 160;
/** 長い行を切るとき、見つかった所の前に残す文字数 */
const LEAD_CHARS = 40;

/**
 * 1 つのノートの中で、query を含む行（大文字・小文字を区別しない。行の頭の空白は省く）。
 * 長い行は見つかった所が見えるように前後を切り（切ったところに「…」）、見つかった所の位置を返す
 */
export function findNoteLines(content: string, query: string, max = MAX_HITS_PER_FILE): Omit<NoteSearchHit, "project_id" | "path">[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const hits: Omit<NoteSearchHit, "project_id" | "path">[] = [];
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

/** いくつものノートのフォルダ（プロジェクトごと）のノート（.md・.html）の中を探す。多すぎれば途中で切る */
export async function searchNoteTexts(sources: readonly { projectId: number; dir: string; files: readonly string[] }[], query: string): Promise<NoteSearchResult> {
  const result: NoteSearchResult = { hits: [], truncated: false };
  const q = query.trim();
  if (!q) return result;
  for (const source of sources) {
    for (const file of source.files) {
      if (!noteExtensionOf(file)) continue;
      const full = path.join(source.dir, file);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) continue;
      const content = await fs.readFile(full, "utf8").catch(() => "");
      for (const hit of findNoteLines(content, q)) {
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
