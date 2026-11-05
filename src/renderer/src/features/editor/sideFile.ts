import type { GitFileChange, GitStatus } from "@shared/types";

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
