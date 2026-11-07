import type { FolderInspection } from "@shared/types";
import { GIT_FEATURES } from "./GitInitNotice";

/** git の管理を始めるかのチェックの文（label）と、チェックの状態ごとの説明（help） */
export interface GitInitChoice {
  label: string;
  help: (checked: boolean) => string;
}

/** フォルダ内のファイルをすべて最初のコミットにするときの注意 */
const COMMIT_ALL = "フォルダ内のファイルがすべてコミットされます。秘密情報などがあれば、先に .gitignore に追加してください。";

/**
 * 既存のフォルダを取り込む・プロジェクトのフォルダを変えるときに、git の管理を始めるかのチェック（出さないなら null。初めはオフ）。
 * - git でない・コミットがない（リポジトリの一番上）: 初期化して最初のコミットを作るか
 * - git のリポジトリの中のフォルダ: 親のリポジトリの中のフォルダとして使うか、このフォルダで別のリポジトリとして始めるか
 *   （親がこの中のファイルを管理していれば、二重に管理することになるので出さない）
 * - もうコミットのあるリポジトリの一番上: 出さない
 */
export function gitInitChoice(info: FolderInspection): GitInitChoice | null {
  if (!info.exists || !info.is_directory) return null;
  if (info.is_git && info.git_root !== info.path) {
    if (info.parent_tracked) return null;
    return {
      label: "このフォルダで新しく git の管理を始める（親のリポジトリとは別のリポジトリにする）",
      help: (checked) =>
        checked
          ? `このフォルダをリポジトリとして初期化し、最初のコミットを作ります。親のリポジトリ（${info.git_root}）からは、このフォルダが別のリポジトリに見えます。${COMMIT_ALL}`
          : `親のリポジトリ（${info.git_root}）の中のフォルダとして使います。変更・履歴・ワークツリーは、このフォルダの中だけを扱います。`,
    };
  }
  if (info.is_git && info.has_commits) return null;
  return {
    label: info.is_git ? "git の管理を始める（既存のファイルで最初のコミットを作成する）" : "git の管理を始める（リポジトリとして初期化し、既存のファイルで最初のコミットを作成する）",
    help: (checked) => (checked ? COMMIT_ALL : `始めないと、${GIT_FEATURES}は使えません（あとから「git の管理を始める」で始められます）。チャットは使えます。`),
  };
}
