import type { ProjectSearchResult, SearchMatch } from "@shared/types";

/** 検索の結果のファイル（ファイルごとの見つかった行） */
export type SearchFileResult = ProjectSearchResult["files"][number];

/** 結果から外したもの（VS Code の「却下」と同じ。ファイルはパス、行は「パス 改行 行番号」） */
export type DismissedResults = ReadonlySet<string>;

/** 行を結果から外すときの印 */
export const lineKey = (path: string, line: number) => `${path}\n${line}`;

/** 外したものを除いた結果（行をすべて外したファイルも除く） */
export function visibleResults(files: readonly SearchFileResult[], dismissed: DismissedResults): SearchFileResult[] {
  if (dismissed.size === 0) return files as SearchFileResult[];
  return files.flatMap((file) => {
    if (dismissed.has(file.path)) return [];
    const matches = file.matches.filter((m) => !dismissed.has(lineKey(file.path, m.line)));
    return matches.length === 0 ? [] : [matches.length === file.matches.length ? file : { ...file, matches }];
  });
}

/** 置換する行（置換の API の files の形。行の文は結果のまま送り、いまの行と違えばコアが置換しない） */
export function replaceTargets(files: readonly { path: string; matches: readonly SearchMatch[] }[]) {
  return files.map((f) => ({ path: f.path, lines: f.matches.map((m) => ({ line: m.line, text: m.text })) }));
}

/** 結果の数（ファイルと行） */
export const resultCounts = (files: readonly SearchFileResult[]) => ({ files: files.length, lines: files.reduce((n, f) => n + f.matches.length, 0) });

/** 検索の履歴に足す（新しいものを先頭に。同じものは前から消し、多ければ古いものを捨てる） */
export function pushHistory(history: readonly string[], query: string, max = 20): string[] {
  const q = query.trim();
  if (!q) return [...history];
  return [q, ...history.filter((h) => h !== q)].slice(0, max);
}
