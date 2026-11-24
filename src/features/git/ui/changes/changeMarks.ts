// 変更の記号（ファイルとフォルダ。ファイルの木・変更の一覧・コミット・PR の変更の木が同じ数え方を使う）
import type { GitChangeKind, GitFileChange, GitStatus } from "@shared/git/types";
import { GIT_CHANGE_LABELS } from "@shared/git/labels";
import { parentFolders } from "@/foundation/ui/kit/list/treeModel";
import type { ChangeMark, ChangeMarks } from "@/features/files/ui";

/** 目立たせる順（競合がいちばん。フォルダには、中でいちばん目立つものの色を付ける） */
const PRIORITY: GitChangeKind[] = ["!", "M", "T", "D", "R", "C", "A", "U"];

/**
 * ファイルとフォルダの変更の記号。ファイルは、まだステージしていない変更・競合を、ステージ済みより優先する。
 * フォルダは、中にあるファイル（消したファイルも含む）でいちばん目立つもの
 */
export function changeKinds(status: GitStatus | undefined): ChangeMarks {
  return kindMaps(status?.repo ? [...status.staged, ...status.unstaged, ...status.conflicts] : []);
}

/** 変更の一覧から、ファイルとフォルダの記号と名前を作る（後ろにあるものほど優先する） */
export function kindMaps(changes: readonly GitFileChange[]): ChangeMarks {
  const files = new Map<string, GitChangeKind>();
  const folders = new Map<string, GitChangeKind>();
  for (const change of changes) files.set(change.path, change.kind);
  const stronger = (a: GitChangeKind | undefined, b: GitChangeKind) => (a !== undefined && PRIORITY.indexOf(a) <= PRIORITY.indexOf(b) ? a : b);
  for (const [file, kind] of files) {
    for (const folder of parentFolders(file)) folders.set(folder, stronger(folders.get(folder), kind));
  }
  const mark = (kind: GitChangeKind): ChangeMark => ({ kind, label: GIT_CHANGE_LABELS[kind] });
  return { files: new Map([...files].map(([path, kind]) => [path, mark(kind)])), folders: new Map([...folders].map(([path, kind]) => [path, mark(kind)])) };
}
