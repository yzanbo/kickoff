// ファイルの中を探す（git grep）
import type { ProjectSearchQuery, ProjectSearchResult } from "@shared/types";
import { Invalid } from "../http/errors.js";
import { gitOutput } from "./exec.js";

/** 検索で返す行の上限・1 ファイルあたりの上限・1 行の長さの上限 */
const MAX_MATCHES = 2000;
const MAX_MATCHES_PER_FILE = 200;
const MAX_LINE_CHARS = 400;

/**
 * プロジェクトのファイルの中を探す（git grep。.gitignore で無視しているもの・バイナリは除く。未追加のファイルは含める）。
 * 探せなければ 400（正規表現の書き方が正しくないときは、そう伝える）
 */
export async function searchProject(repo: string, { query, case_sensitive: caseSensitive, whole_word: wholeWord, regex }: ProjectSearchQuery): Promise<ProjectSearchResult> {
  const result: ProjectSearchResult = { files: [], total: 0, truncated: false };
  if (!query) return result;
  // --no-full-name: リポジトリの中のフォルダでは、そのフォルダから見たパスで返す（設定の grep.fullName に左右されない）
  const args = ["grep", "-n", "--column", "-I", "--untracked", "--no-full-name", "-z", `--max-count=${MAX_MATCHES_PER_FILE}`];
  if (!caseSensitive) args.push("-i");
  if (wholeWord) args.push("-w");
  args.push(regex ? "-E" : "-F", "-e", query);
  // 見つからなければ終了コード 1
  const out = await gitOutput(repo, args, [1]).catch(() => {
    throw new Invalid(regex ? "正規表現の書き方が正しくありません" : "検索できませんでした");
  });
  for (const record of out.split("\n")) {
    if (!record) continue;
    const [file, line, column, ...rest] = record.split("\0");
    if (result.total >= MAX_MATCHES) {
      result.truncated = true;
      break;
    }
    const text = rest.join("\0");
    let entry = result.files.at(-1);
    if (entry?.path !== file) result.files.push((entry = { path: file, matches: [] }));
    entry.matches.push({ line: Number(line), column: Number(column), text: text.length > MAX_LINE_CHARS ? text.slice(0, MAX_LINE_CHARS) : text });
    result.total++;
  }
  return result;
}
