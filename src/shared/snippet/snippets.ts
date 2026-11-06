// 定型文の決まり（コアと画面で共通の純粋な関数）
import type { Snippet } from "@shared/types";

/** 名前を省いたときに見せる本文の 1 行目の長さ */
const FALLBACK_LABEL_CHARS = 24;

/** 帯・一覧に出す名前（名前がなければ本文の空でない最初の行。長ければ切って「…」） */
export function snippetLabel(snippet: Pick<Snippet, "label" | "text">): string {
  if (snippet.label) return snippet.label;
  const line =
    snippet.text
      .split("\n")
      .find((l) => l.trim() !== "")
      ?.trim() ?? "";
  return line.length > FALLBACK_LABEL_CHARS ? `${line.slice(0, FALLBACK_LABEL_CHARS)}…` : line;
}

/** そのプロジェクトで使える定型文（共通とそのプロジェクトだけのもの。並びは保つ） */
export const snippetsFor = (snippets: readonly Snippet[], projectId: number): Snippet[] =>
  snippets.filter((s) => s.project_id === null || s.project_id === projectId);

/** 並び順（position → id） */
export const bySnippetPosition = (a: Snippet, b: Snippet) => a.position - b.position || a.id - b.id;

/**
 * 見えている一部（visible。全体の並びと同じ順）の中で id を delta だけ動かしたときの、全体の並び（ID の列）。
 * 一部の中で隣の定型文と場所を入れ替え、見えていないものの位置は変えない（プロジェクトの設定では、ほかのプロジェクトだけのものは見えないため）。
 * 動かせなければ null
 */
export function moveWithin(all: readonly number[], visible: readonly number[], id: number, delta: number): number[] | null {
  const from = visible.indexOf(id);
  const to = Math.max(0, Math.min(visible.length - 1, from + delta));
  if (from < 0 || from === to) return null;
  const moved = [...visible];
  moved.splice(to, 0, ...moved.splice(from, 1));
  // 見えているものが並んでいた枠に、動かしたあとの順で入れ直す
  const shown = new Set(visible);
  let i = 0;
  return all.map((x) => (shown.has(x) ? moved[i++] : x));
}
