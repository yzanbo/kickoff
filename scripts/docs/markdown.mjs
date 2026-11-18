// 文書の検査（scripts/check-docs.mjs）の読み方のうち、Markdown の文を見るもの: 長い行・書かない言葉・参照・表・見出し。
// どれも入出力をしない純粋な関数（テストは scripts/check-docs.test.mjs）
import path from "node:path";

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const IGNORE = "docs-ignore:";

/** 行ごとに、コードの囲み（``` / ~~~）の中か（囲みの線そのものも中とみなす） */
function fencedFlags(lines) {
  let inside = false;
  return lines.map((line) => {
    if (FENCE.test(line)) {
      inside = !inside;
      return true;
    }
    return inside;
  });
}

/** 上限（バイト）を超える行の番号（1 から）。表の行（| で始まる）とコードの囲みの中は数えない */
export function longLinesIn(text, lineLimit) {
  const lines = text.split("\n");
  const fenced = fencedFlags(lines);
  const out = [];
  lines.forEach((line, i) => {
    if (fenced[i] || line.trimStart().startsWith("|")) return;
    if (Buffer.byteLength(line, "utf8") > lineLimit) out.push(i + 1);
  });
  return out;
}

export function countLongLines(text, lineLimit) {
  return longLinesIn(text, lineLimit).length;
}

/** HTML のコメント（<!-- … -->）の中を空白にする（行の数と位置は変えない） */
function blankHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * 1 行の中の、パターンに合う所（重なるものは先に見つけた 1 つだけ）。
 * 「以前は」が「以前は」と「前は」の両方に合っても 1 つに数えるため
 */
export function matchesInLine(line, patterns) {
  const found = [];
  for (const { pattern, label } of patterns) {
    for (const m of line.matchAll(new RegExp(pattern, "g"))) {
      const start = m.index;
      const end = start + Math.max(m[0].length, 1);
      if (found.some((f) => start < f.end && f.start < end)) continue;
      found.push({ label, start, end });
    }
  }
  return found;
}

/**
 * 書かない言葉が出てくる所（1 か所ごとに 1 つ）。HTML のコメントの中は数えない。
 * 「docs-ignore: 理由」を書いた行と、その次の行は見逃す
 */
export function countForbidden(text, patterns) {
  const raw = text.split("\n");
  const lines = blankHtmlComments(text).split("\n");
  const out = [];
  lines.forEach((line, i) => {
    if (raw[i].includes(IGNORE) || (i > 0 && raw[i - 1].includes(IGNORE))) return;
    for (const m of matchesInLine(line, patterns)) out.push({ label: m.label, line: i + 1 });
  });
  return out;
}

/** コードの囲みの外の行（参照を探すときに使う。囲みの中の行は空にして、行の番号を保つ） */
function outsideFences(text) {
  const lines = text.split("\n");
  const fenced = fencedFlags(lines);
  return lines.map((line, i) => (fenced[i] ? "" : line));
}

const REF_EXT = /\.(ts|tsx|mjs|cjs|js|json|css|md|yml|html|swift)$/;

/**
 * `…/….拡張子` の形で書いたファイルの参照（/ を含み、拡張子が決めたもので、* < … 空白 { を含まないもの）。
 * リポジトリの外を指すもの（/・~ で始まる・URL）は除く
 */
export function pathRefsIn(text) {
  const out = [];
  for (const line of outsideFences(text)) {
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const ref = m[1];
      if (!ref.includes("/") || !REF_EXT.test(ref) || /[*<…\s{]/.test(ref)) continue;
      if (/^[/~]/.test(ref) || ref.includes("://")) continue;
      out.push(ref);
    }
  }
  return out;
}

/** 「」の中身（入れ子の「」も含める）。閉じていなければ null */
function bracketed(line, open) {
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    if (line[i] === "「") depth++;
    else if (line[i] === "」" && --depth === 0) return line.slice(open + 1, i);
  }
  return null;
}

/** 「`….md` の「見出し」」の形の、ほかの文書の見出しへの参照（見出しの中の「」もそのまま） */
export function headingRefsIn(text) {
  const out = [];
  for (const line of outsideFences(text)) {
    for (const m of line.matchAll(/`([^`\s]*\.md)` ?の(?=「)/g)) {
      const heading = bracketed(line, m.index + m[0].length);
      if (heading) out.push({ doc: m[1], heading });
    }
  }
  return out;
}

/** 見出しの行の文（# を外したもの） */
export function headingsOf(text) {
  const out = [];
  for (const line of outsideFences(text)) {
    const m = HEADING.exec(line);
    if (m) out.push(m[2]);
  }
  return out;
}

const suffixIndex = new WeakMap();

/** ファイルの集合の「/ の境目からの後ろ」→ 合うファイルの並び（後ろの一致で探すため。集合ごとに 1 回作る） */
function suffixesOf(files) {
  let index = suffixIndex.get(files);
  if (index) return index;
  index = new Map();
  for (const file of files) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) {
      const suffix = parts.slice(i).join("/");
      const list = index.get(suffix);
      if (list) list.push(file);
      else index.set(suffix, [file]);
    }
  }
  suffixIndex.set(files, index);
  return index;
}

/**
 * 参照が指しうるファイルの全部: リポジトリの直下からの相対・文書のフォルダからの相対・import の別名（`@shared/…` など）・
 * ファイルの後ろの一致（/ の境目で）。「`CLAUDE.md` の「性能」」のように、どれを指すか文書からは決まらないものがあるので、全部を返す
 */
export function resolveRef(ref, docFile, files, aliases = {}) {
  const bare = ref.replace(/^\.\//, "");
  const found = new Set();
  if (files.has(bare)) found.add(bare);
  const relative = path.posix.normalize(path.posix.join(path.posix.dirname(docFile), ref));
  if (files.has(relative)) found.add(relative);
  for (const [prefix, target] of Object.entries(aliases)) {
    if (bare.startsWith(prefix) && files.has(target + bare.slice(prefix.length))) found.add(target + bare.slice(prefix.length));
  }
  for (const file of suffixesOf(files).get(bare) ?? []) found.add(file);
  return [...found];
}

export function refExists(ref, docFile, files, aliases = {}) {
  return resolveRef(ref, docFile, files, aliases).length > 0;
}

/** 表の行のセル（\| は区切りにしない。前後の | と空白を外す） */
function cellsOf(line) {
  const body = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

const SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** 行の並びの中の表（見出しの行・区切りの行・データの行。データの行は行の番号つき） */
export function tablesIn(lines, firstLine = 1) {
  const tables = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trimStart().startsWith("|") || !SEPARATOR.test(lines[i + 1].trim())) continue;
    const table = { header: cellsOf(lines[i]), rows: [] };
    let j = i + 2;
    for (; j < lines.length && lines[j].trimStart().startsWith("|"); j++) table.rows.push({ line: firstLine + j, cells: cellsOf(lines[j]) });
    tables.push(table);
    i = j - 1;
  }
  return tables;
}

/**
 * 語彙の表から、コードの名前を拾う: 見出し（文に heading を含む最初の見出し）から次の見出しまでの表の、column 列目（1 から）に
 * ` で囲んで書いた名前のうち、識別子の形のもの（重ならないように）
 */
export function vocabularyNames(markdown, heading, column) {
  const lines = outsideFences(markdown);
  const start = lines.findIndex((line) => HEADING.exec(line)?.[2].includes(heading));
  if (start < 0) return [];
  let end = start + 1;
  while (end < lines.length && !HEADING.test(lines[end])) end++;
  const names = new Set();
  for (const table of tablesIn(lines.slice(start + 1, end))) {
    for (const row of table.rows) {
      for (const m of (row.cells[column - 1] ?? "").matchAll(/`([^`]+)`/g)) {
        if (/^[A-Za-z_$][\w$]*$/.test(m[1])) names.add(m[1]);
      }
    }
  }
  return [...names];
}
