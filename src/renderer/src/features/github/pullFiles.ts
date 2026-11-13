// PR の変更したファイルを、変更タブと同じファイルの木の印にする（純粋関数）
import type { GitChangeKind, GitFileChange, GitHubPullFile } from "@shared/types";

/** GitHub の変わり方（status）→ 木の印（変更タブと同じ記号。名前の変更・コピー・ほかは M） */
export function pullFileKind(status: string): GitChangeKind {
  switch (status) {
    case "added":
      return "A";
    case "removed":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    default:
      return "M";
  }
}

/** 木と印に渡す形（パス・元のパス・印） */
export const pullFileChanges = (files: GitHubPullFile[]): GitFileChange[] =>
  files.map((f) => ({ path: f.path, ...(f.previous_path ? { old_path: f.previous_path } : {}), kind: pullFileKind(f.status) }));
