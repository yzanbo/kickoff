// ファイルの中を探す（git grep）と、探した結果を置換する
import fs from "node:fs/promises";
import type { ProjectReplaceBody, ProjectReplaceResult, ProjectSearchQuery, ProjectSearchResult } from "@shared/types";
import { toPathspecs } from "@shared/search/pathGlobs";
import { replaceInLine, searchPattern } from "@shared/search/searchMatch";
import { Invalid, NotFound } from "../http/errors.js";
import { gitOutput } from "./exec.js";
import { hashOf, MAX_FILE_BYTES, resolveInside } from "./files.js";
import { plainSearchExcludes } from "./plainFolder.js";
import { isGitWorkTree } from "./status.js";

/** 検索で返す行の上限・1 ファイルあたりの上限・1 行の長さの上限 */
const MAX_MATCHES = 2000;
const MAX_MATCHES_PER_FILE = 200;
const MAX_LINE_CHARS = 400;
/** 置換の応答に、元に戻す用の置換前の中身を入れる上限（合計の文字数。超えたら入れない） */
const MAX_UNDO_CHARS = 20_000_000;

/** 結果の行の文（長い行は途中で切る。置換のときの照合にも同じ形を使う） */
const lineText = (text: string) => (text.length > MAX_LINE_CHARS ? text.slice(0, MAX_LINE_CHARS) : text);

/**
 * プロジェクトのファイルの中を探す（git grep。.gitignore で無視しているもの・バイナリは除く。未追加のファイルは含める）。
 * 含める・除外するファイル（VS Code と同じ glob のカンマ区切り）は pathspec に、use_ignore が false なら無視しているファイルも探す。
 * Git で管理していないフォルダは git grep --no-index で探す（.gitignore は --exclude-standard で読み、node_modules などもいつも除く。plainFolder.ts）。
 * 探せなければ 400（正規表現の書き方が正しくないときは、そう伝える）
 */
export async function searchProject(repo: string, q: ProjectSearchQuery): Promise<ProjectSearchResult> {
  const result: ProjectSearchResult = { files: [], total: 0, truncated: false };
  if (!q.query) return result;
  // --no-full-name: リポジトリの中のフォルダでは、そのフォルダから見たパスで返す（設定の grep.fullName に左右されない）
  const plain = !(await isGitWorkTree(repo));
  const args = ["grep", "-n", "--column", "-I", "--no-full-name", "-z", `--max-count=${MAX_MATCHES_PER_FILE}`];
  // Git の中は未追加のファイルも探し、無視しているものは既定で除く。--no-index（Git の外）は逆で、無視しているものを除くには頼む
  if (plain) args.push("--no-index", ...(q.use_ignore ? ["--exclude-standard"] : []));
  else args.push("--untracked", ...(q.use_ignore ? [] : ["--no-exclude-standard"]));
  if (!q.case_sensitive) args.push("-i");
  if (q.whole_word) args.push("-w");
  args.push(q.regex ? "-E" : "-F", "-e", q.query, "--", ...toPathspecs(q.include, q.exclude), ...(plain && q.use_ignore ? plainSearchExcludes() : []));
  // 見つからなければ終了コード 1
  const out = await gitOutput(repo, args, [1]).catch(() => {
    throw new Invalid(q.regex ? "正規表現の書き方が正しくありません" : "検索できませんでした（含める・除外するファイルの書き方を確かめてください）");
  });
  for (const record of out.split("\n")) {
    if (!record) continue;
    const [file, line, column, ...rest] = record.split("\0");
    if (result.total >= MAX_MATCHES) {
      result.truncated = true;
      break;
    }
    let entry = result.files.at(-1);
    if (entry?.path !== file) result.files.push((entry = { path: file, matches: [] }));
    entry.matches.push({ line: Number(line), column: Number(column), text: lineText(rest.join("\0")) });
    result.total++;
  }
  return result;
}

/**
 * 探した結果の行を置換する（VS Code の検索の置換）。行ごとに、いまの行が結果の行の文と同じときだけ、その行の中の見つかる部分をすべて置き換える
 * （探したあとでほかで変わった行は置換せず skipped に。探し方は画面の印と同じ @shared/search の正規表現）。
 * 置換したファイルは、置換する前の中身（元に戻す用。合計が大きすぎれば null）と置換したあとの指紋を返す。改行（CRLF）はそのまま残す
 */
export async function replaceInProject(repo: string, body: ProjectReplaceBody): Promise<ProjectReplaceResult> {
  const pattern = searchPattern(body.query);
  if (!pattern) throw new Invalid(body.query.regex ? "正規表現の書き方が正しくありません" : "探す文字を入れてください");
  const options = { regex: body.query.regex, preserveCase: body.preserve_case };
  const result: ProjectReplaceResult = { replaced: 0, files: [], skipped: [] };
  let undoChars = 0;
  for (const target of body.files) {
    let real: string;
    try {
      real = await resolveInside(repo, target.path);
    } catch (e) {
      if (e instanceof NotFound) {
        result.skipped.push({ path: target.path, reason: "ファイルがありません" });
        continue;
      }
      throw e;
    }
    const data = await fs.readFile(real);
    if (data.length > MAX_FILE_BYTES || data.subarray(0, 8000).includes(0)) {
      result.skipped.push({ path: target.path, reason: data.length > MAX_FILE_BYTES ? "大きすぎるファイルです" : "バイナリのファイルです" });
      continue;
    }
    const before = data.toString("utf8");
    const lines = before.split("\n");
    let count = 0;
    let stale = 0;
    for (const { line, text } of target.lines) {
      const raw = lines[line - 1];
      if (raw === undefined || lineText(raw) !== text) {
        stale++;
        continue;
      }
      const cr = raw.endsWith("\r");
      const replaced = replaceInLine(cr ? raw.slice(0, -1) : raw, pattern, body.replace, options);
      lines[line - 1] = replaced.text + (cr ? "\r" : "");
      count += replaced.count;
    }
    if (stale > 0) result.skipped.push({ path: target.path, reason: `${stale} 行は探したあとで変わっていたので、置換していません` });
    if (count === 0) continue;
    const after = Buffer.from(lines.join("\n"), "utf8");
    await fs.writeFile(real, after);
    undoChars += before.length;
    result.files.push({ path: target.path, count, before, hash: hashOf(after) });
    result.replaced += count;
  }
  // 元に戻す用の中身が大きすぎれば入れない（画面は元に戻すを出さない）
  if (undoChars > MAX_UNDO_CHARS) for (const f of result.files) f.before = null;
  return result;
}
