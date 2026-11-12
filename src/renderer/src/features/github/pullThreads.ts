import type { GitHubReviewThread } from "@shared/types";
import type { DiffLine } from "@/features/editor/parseDiff";

/** 1 つのファイルのスレッドを、差分のどの行の下に出すかで分けたもの */
export interface PlacedThreads {
  /** 「new:12」「old:8」→ その行の下に出すスレッド */
  byLine: Map<string, GitHubReviewThread[]>;
  /** 差分の中に行が見つからないもの（古い差分へのスレッド・差分の外の行）。ファイルの下にまとめて出す */
  rest: GitHubReviewThread[];
}

const lineKey = (side: "new" | "old", no: number) => `${side}:${no}`;

/** 差分の行の置き場所の名前（足した行・残した行は新しい側、消した行は古い側） */
export function keyOfLine(line: DiffLine): string | null {
  if (line.newNo !== undefined && line.type !== "del") return lineKey("new", line.newNo);
  if (line.oldNo !== undefined) return lineKey("old", line.oldNo);
  return null;
}

/**
 * PR の行のスレッドを、そのファイルの差分の行に割り当てる。RIGHT は新しい側の行、LEFT は古い側の行に付ける
 * （GitHub と同じ）。行がいまの差分にない（line が null の古い差分・差分の外の行）ものは rest に回す
 */
export function placeThreads(threads: GitHubReviewThread[], path: string, lines: DiffLine[]): PlacedThreads {
  const shown = new Set<string>();
  for (const line of lines) {
    const key = keyOfLine(line);
    if (key) shown.add(key);
    // 残した行は古い側の番号でも引けるようにする（LEFT のスレッドが残した行に付くことがある）
    if (line.type === "context" && line.oldNo !== undefined) shown.add(lineKey("old", line.oldNo));
  }
  const byLine = new Map<string, GitHubReviewThread[]>();
  const rest: GitHubReviewThread[] = [];
  for (const thread of threads) {
    if (thread.path !== path) continue;
    const key = thread.line === null ? null : lineKey(thread.side === "LEFT" ? "old" : "new", thread.line);
    if (key && shown.has(key)) byLine.set(key, [...(byLine.get(key) ?? []), thread]);
    else rest.push(thread);
  }
  return { byLine, rest };
}

/** 残した行に付いたスレッド（古い側・新しい側のどちらの番号で付いていても）を引く */
export function threadsAt(placed: PlacedThreads, line: DiffLine): GitHubReviewThread[] {
  const own = keyOfLine(line);
  const found = own ? (placed.byLine.get(own) ?? []) : [];
  if (line.type !== "context" || line.oldNo === undefined) return found;
  return [...found, ...(placed.byLine.get(lineKey("old", line.oldNo)) ?? [])];
}
