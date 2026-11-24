// 文書の検査（scripts/check-docs.mjs）の決まりのうち、文書の外も見るもの: 上限・祖先の CLAUDE.md・機能の一覧・コードのコメント・語彙の名前。
// どれも入出力をしない純粋な関数（テストは scripts/check-docs.test.mjs）
import path from "node:path";
import { matchesAny, parseCode } from "../structure/parse.mjs";
import { matchesInLine, tablesIn, vocabularyNames } from "./markdown.mjs";

/** ファイルの上限（バイト）。上から最初に合ったもの（{ glob, bytes } か、差し替えの { path | glob, max }）。合うものがなければ null */
export function limitFor(file, limits) {
  for (const limit of limits) {
    const hit = limit.path !== undefined ? limit.path === file : matchesAny(file, [limit.glob]);
    if (hit) return limit.bytes ?? limit.max;
  }
  return null;
}

/** 自分と祖先のフォルダの CLAUDE.md（リポジトリの直下まで。ある分だけ、近い順） */
export function ancestorDocs(file, docFiles) {
  const out = [];
  let dir = path.posix.dirname(file);
  for (;;) {
    const doc = dir === "." ? "CLAUDE.md" : `${dir}/CLAUDE.md`;
    if (docFiles.has(doc)) out.push(doc);
    if (dir === ".") return out;
    dir = path.posix.dirname(dir);
  }
}

const FEATURE_ID = /^(PRJ|LST|CHT|RUN|SUB|ATT|VOI|NOTE|CODE|TERM|DB|GH|AIT|MOB|SET|BASE|EXT)-\d{3}$/;
const NF_ID = /^NF-\d{2}$/;

/** 確かめ方の 1 つの欄（`M`・`T:<名前>`・`E:<名前>` をカンマで並べたもの。頭のない名前は前の頭を引き継ぐ = `T:a,b`）の誤り */
function verifyErrors(value, files) {
  const errors = [];
  let kind = null;
  for (const raw of value.replace(/`/g, "").split(",")) {
    const item = raw.trim();
    const m = /^(T|E):(.+)$/.exec(item);
    if (item === "M") kind = null;
    else if (m) kind = m[1];
    if (item === "M") continue;
    const name = m ? m[2].trim() : item;
    if (kind === null || name === "" || /\s/.test(name)) {
      errors.push(`確かめ方「${value}」は M・T:<テストの名前>・E:<通しの確かめの名前> をカンマで並べる`);
      break;
    }
    if (kind === "T" && !files.testNames.has(name)) errors.push(`T:${name} のテスト（${name}.test.ts・.test.tsx）がない`);
    if (kind === "E" && !files.all.has(`scripts/e2e/scenarios/${name}.mjs`)) errors.push(`E:${name} の通しの確かめ（scripts/e2e/scenarios/${name}.mjs）がない`);
  }
  return errors;
}

/** テストのファイルの名前（.test.ts(x) を外したもの）の集合。同じ名前が何か所にもあるものは、パスの後ろ（`codex/provider`）でも引ける */
function testNamesOf(files) {
  const names = new Set();
  for (const file of files) {
    const m = /(?:^|\/)([^/]+)\.test\.tsx?$/.exec(file);
    if (!m) continue;
    const parts = file.replace(/\.test\.tsx?$/, "").split("/");
    for (let i = 0; i < parts.length; i++) names.add(parts.slice(i).join("/"));
    // 機能の中のテストは「機能/名前」でも引ける（routes.test.ts のように同じ名前が機能ごとにあるもの）
    const feature = /^src\/features\/([^/]+)\//.exec(file);
    if (feature) names.add(`${feature[1]}/${m[1]}`);
  }
  return names;
}

/**
 * docs/features.md の表の誤り（ID の形と重なり・確かめ方の形・T: と E: の名前の実在）。
 * 列は見出しの名前で引く（ID の列がない表は見ない・知らない列は読み飛ばす）
 */
export function checkFeatures(text, files) {
  const ctx = { all: files, testNames: testNamesOf(files) };
  const seen = new Map();
  const errors = [];
  for (const table of tablesIn(text.split("\n"))) {
    const idAt = table.header.indexOf("ID");
    if (idAt < 0) continue;
    const verifyAt = table.header.indexOf("確かめ方");
    for (const row of table.rows) {
      const id = (row.cells[idAt] ?? "").replace(/`/g, "");
      const at = `docs/features.md:${row.line}`;
      if (!FEATURE_ID.test(id) && !NF_ID.test(id)) errors.push(`${at}: ID「${id}」の形が違う（PRJ-001・NF-01 の形）`);
      else if (seen.has(id)) errors.push(`${at}: ID ${id} が ${seen.get(id)} 行目と重なる`);
      else seen.set(id, row.line);
      if (verifyAt >= 0) for (const e of verifyErrors(row.cells[verifyAt] ?? "", ctx)) errors.push(`${at}: ${id}: ${e}`);
    }
  }
  return errors;
}

/**
 * 文書の見出しの下の表の column 列目の名前の並びが names（scripts/structure.config.mjs の FEATURES など）と同じか。
 * 違えば最初に食い違った所を 1 つ返す
 */
export function orderErrors(markdown, { file, heading, column, names }) {
  const found = vocabularyNames(markdown, heading, column);
  const at = Array.from({ length: Math.max(found.length, names.length) }, (_, i) => i).find((i) => found[i] !== names[i]);
  if (at === undefined) return [];
  return [`${file}: 「${heading}」の表の ${at + 1} 番目が ${found[at] ?? "（ない）"}（並びは ${names[at] ?? "（ない）"}）`];
}

/** 位置（文字の番号）→ 行の番号（1 から）を引く関数 */
function lineAt(source) {
  const starts = [0];
  for (let i = source.indexOf("\n"); i >= 0; i = source.indexOf("\n", i + 1)) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const COMMENT_IGNORE = "comment-rules-ignore:";

/**
 * コードのコメント（構文木の comments。文字の値の中は見ない）に書かない言葉が出てくる所。
 * 「comment-rules-ignore: 理由」を書いた行は見逃す。どのパターンにも合わないファイルは読まない（速さのため）
 */
export function commentViolations(file, source, patterns) {
  if (!patterns.some(({ pattern }) => new RegExp(pattern).test(source))) return [];
  const toLine = lineAt(source);
  const lines = source.split("\n");
  const out = [];
  for (const comment of parseCode(file, source).comments) {
    const text = source.slice(comment.start, comment.end);
    let offset = comment.start;
    for (const part of text.split("\n")) {
      const line = toLine(offset);
      if (!lines[line - 1].includes(COMMENT_IGNORE)) for (const m of matchesInLine(part, patterns)) out.push({ label: m.label, line });
      offset += part.length + 1;
    }
  }
  return out;
}

/** 名前のうち、どのソースにも語として出てこないもの（語は識別子の形の並び。ソースを 1 回だけ読む） */
export function missingNames(names, sources) {
  const words = new Set();
  for (const source of sources.values()) for (const m of source.matchAll(/[A-Za-z_$][\w$]*/g)) words.add(m[0]);
  return names.filter((name) => !words.has(name));
}
