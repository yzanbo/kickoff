import type { GitDiff, GitFileChange, GitStatus } from "@shared/types";

/**
 * Git の状態から、そのファイルのコミットしていない変更（差分に出すもの）を探す。競合 → ステージされていない変更 → ステージされている変更の順に見る
 * （作業ツリーの中身にいちばん近い差分を出すため）。変更がない・Git で管理されていない・まだ読んでいないなら undefined
 */
export function changeOf(status: GitStatus | undefined, path: string): { file: GitFileChange; staged: boolean } | undefined {
  if (!status?.repo) return undefined;
  const find = (list: readonly GitFileChange[]) => list.find((f) => f.path === path);
  const unstaged = find(status.conflicts) ?? find(status.unstaged);
  if (unstaged) return { file: unstaged, staged: false };
  const staged = find(status.staged);
  return staged ? { file: staged, staged: true } : undefined;
}

/**
 * コミットしていない変更のあるファイル（右の欄の「変更」に縦に並べるもの）。同じファイルは 1 つにまとめ（どの差分を出すかは changeOf と同じ決め方）、パスの順に並べる
 */
export function changedFiles(status: GitStatus | undefined): { file: GitFileChange; staged: boolean }[] {
  if (!status?.repo) return [];
  const paths = [...new Set([...status.conflicts, ...status.unstaged, ...status.staged].map((f) => f.path))].sort((a, b) => a.localeCompare(b));
  return paths.flatMap((path) => changeOf(status, path) ?? []);
}

/** 差分の指紋（確認したあとで差分が変わったかを見分ける。FNV-1a の 32 ビット） */
export function diffFingerprint(diff: GitDiff): string {
  const text = `${diff.binary ? "b" : ""}${diff.truncated ? "t" : ""}:${diff.diff}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * ファイルを確認済みにしているか: viewed = 確認済み（いまの差分は確認したときのまま。差分を読み込む前もそうみなす）/
 * changed = 確認したあとで差分が変わった / none = 確認していない
 */
export function viewedStateOf(viewed: Readonly<Record<string, string>>, path: string, fingerprint: string | undefined): "viewed" | "changed" | "none" {
  const saved = viewed[path];
  if (saved === undefined) return "none";
  return fingerprint === undefined || fingerprint === saved ? "viewed" : "changed";
}

/** もう変更のないファイル（コミットした・元に戻した）の確認済みの印を外す（外すものがなければ同じものを返す） */
export function pruneViewed(viewed: Readonly<Record<string, string>>, paths: readonly string[]): Readonly<Record<string, string>> {
  const keep = new Set(paths);
  const stale = Object.keys(viewed).filter((p) => !keep.has(p));
  if (stale.length === 0) return viewed;
  return Object.fromEntries(Object.entries(viewed).filter(([p]) => keep.has(p)));
}
