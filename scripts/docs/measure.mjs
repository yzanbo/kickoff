// 文書の検査（scripts/check-docs.mjs）の数え方と基準線: 読んだ中身から数を出し、基準線（scripts/docs-baseline.json）と比べる。
// 入出力をしない純粋な関数（テストは scripts/check-docs.test.mjs）
import { matchesAny } from "../structure/parse.mjs";
import { countForbidden, headingRefsIn, headingsOf, longLinesIn, pathRefsIn, refExists, resolveRef, vocabularyNames } from "./markdown.mjs";
import { ancestorDocs, checkFeatures, commentViolations, limitFor, missingNames } from "./rules.mjs";

/** ファイルごとの数（この順で基準線に載せる） */
const FILE_METRICS = ["bytes", "ancestors", "longLines", "forbidden", "brokenRefs"];

const bytesOf = (text) => Buffer.byteLength(text, "utf8");

/** 切れた参照（ファイルの参照と、見出しの参照）。markdown は見出しを引くための全部の .md の中身 */
function brokenRefsIn(file, text, files, markdown, aliases) {
  const broken = pathRefsIn(text)
    .filter((ref) => !refExists(ref, file, files, aliases))
    .map((ref) => `\`${ref}\` がない`);
  for (const { doc, heading } of headingRefsIn(text)) {
    const targets = resolveRef(doc, file, files, aliases);
    if (!targets.some((target) => headingsOf(markdown.get(target) ?? "").some((h) => h.includes(heading)))) broken.push(`\`${doc}\` の「${heading}」がない`);
  }
  return broken;
}

/**
 * 読んだ中身から数える。docs は見る文書、markdown は全部の .md（見出しを引く）、code はコメントと語彙を探すコードの中身、
 * files は Git が知っている全部のファイル。only: "comments" ならコメントだけ数える。
 * 返す details は --report で出す違反の 1 つずつ（{ metric, file, line?, message }）
 */
export function measureDocs({ docs, markdown = docs, code = new Map(), files, config, extraLimits = [], only = null }) {
  const limits = [...extraLimits, ...(config.limits ?? [])];
  const claudeDocs = new Set([...files].filter((f) => f === "CLAUDE.md" || f.endsWith("/CLAUDE.md")));
  const measured = { files: {}, limits: {}, comments: {}, vocabulary: 0, forbiddenFiles: [], features: [], details: [] };
  const detail = (metric, file, message, line) => measured.details.push({ metric, file, line, message });

  for (const [file, source] of code) {
    if (!matchesAny(file, config.commentFiles ?? []) || matchesAny(file, config.commentExclude ?? [])) continue;
    const found = commentViolations(file, source, config.commentForbidden ?? []);
    if (found.length > 0) measured.comments[file] = found.length;
    for (const v of found) detail("comments", file, `コメントに${v.label}`, v.line);
  }
  if (only === "comments") return measured;

  for (const [file, text] of [...docs].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const isClaude = claudeDocs.has(file);
    const values = { bytes: bytesOf(text) };
    const limit = { bytes: limitFor(file, limits) };
    if (isClaude) {
      values.ancestors = ancestorDocs(file, claudeDocs).reduce((sum, doc) => sum + bytesOf(markdown.get(doc) ?? docs.get(doc) ?? ""), 0);
      limit.ancestors = config.ancestorsLimit ?? null;
    }
    const long = longLinesIn(text, config.lineLimit ?? Infinity);
    const forbidden = countForbidden(text, config.forbidden ?? []);
    const broken = brokenRefsIn(file, text, files, markdown, config.aliases ?? {});
    Object.assign(values, { longLines: long.length, forbidden: forbidden.length, brokenRefs: broken.length });
    measured.files[file] = values;
    measured.limits[file] = limit;
    if (limit.bytes !== null && values.bytes > limit.bytes) detail("bytes", file, `大きさ ${values.bytes} バイト（上限 ${limit.bytes}）`);
    if (isClaude && limit.ancestors !== null && values.ancestors > limit.ancestors) detail("ancestors", file, `祖先の CLAUDE.md と合わせて ${values.ancestors} バイト（上限 ${limit.ancestors}）`);
    for (const line of long) detail("longLines", file, `${config.lineLimit} バイトを超える行`, line);
    for (const v of forbidden) detail("forbidden", file, `書かない言葉: ${v.label}`, v.line);
    for (const message of broken) detail("brokenRefs", file, `切れた参照: ${message}`);
  }

  measured.forbiddenFiles = (config.forbiddenFiles ?? []).filter((f) => files.has(f)).sort();
  for (const f of measured.forbiddenFiles) detail("forbiddenFiles", f, "置かない CLAUDE.md（中間の層の CLAUDE.md は毎回読み込まれる）");

  if (config.features && markdown.has(config.features)) {
    measured.features = checkFeatures(markdown.get(config.features), files);
    for (const message of measured.features) detail("features", config.features, message);
  }

  const vocab = config.vocabulary;
  if (vocab && markdown.has(vocab.file)) {
    const searched = new Map([...code].filter(([f]) => vocab.search.some((dir) => f.startsWith(`${dir}/`))));
    const missing = missingNames(vocabularyNames(markdown.get(vocab.file), vocab.heading, vocab.column), searched);
    measured.vocabulary = missing.length;
    for (const name of missing) detail("vocabulary", vocab.file, `語彙の名前 ${name} がコード（${vocab.search.join("・")}）にない`);
  }
  return measured;
}

/** 数の上限（大きさ・祖先との合計は上限、ほかは 0） */
function allowedOf(measured, file, metric) {
  if (metric === "bytes" || metric === "ancestors") return measured.limits[file]?.[metric] ?? Infinity;
  return 0;
}

function overLimit(measured, file) {
  return FILE_METRICS.some((metric) => measured.files[file][metric] !== undefined && measured.files[file][metric] > allowedOf(measured, file, metric));
}

/** 値が増えたか・減ったかを比べて、added・grown・shrunk に足す */
function compareValue(key, value, allowed, base, out) {
  if (value > allowed) {
    if (base === undefined) out.added.push(`${key}: ${value}（上限 ${allowed}）`);
    else if (value > base) out.grown.push(`${key}: ${base} → ${value}`);
  }
  if (base !== undefined && value < base && base > allowed) out.shrunk.push(`${key}: ${base} → ${value}`);
}

/** 基準線のファイルの数を比べる（直って基準線に残るファイルは stale だけにする） */
function compareFile(measured, file, base, out) {
  if (base !== undefined && (!measured.files[file] || !overLimit(measured, file))) {
    out.stale.push(`files:${file}`);
    return;
  }
  for (const metric of FILE_METRICS) {
    const value = measured.files[file][metric];
    if (value !== undefined) compareValue(`${metric}:${file}`, value, allowedOf(measured, file, metric), base?.[metric], out);
  }
}

/**
 * いまの数と基準線を比べる。added は基準線にない違反、grown は基準線より増えた違反、stale は直ったのに基準線に残るもの、
 * shrunk は減ったが残っている違反（通す。--write-baseline で下げられる）
 */
export function compareWithBaseline(measured, baseline) {
  const out = { added: [], stale: [], grown: [], shrunk: [] };
  const baseFiles = baseline?.files ?? {};
  for (const file of new Set([...Object.keys(measured.files), ...Object.keys(baseFiles)])) compareFile(measured, file, baseFiles[file], out);

  const baseComments = baseline?.comments ?? {};
  for (const [file, count] of Object.entries(measured.comments)) compareValue(`comments:${file}`, count, 0, baseComments[file], out);
  for (const file of Object.keys(baseComments)) if (!measured.comments[file]) out.stale.push(`comments:${file}`);

  const baseVocabulary = baseline?.vocabulary ?? 0;
  if (measured.vocabulary === 0 && baseVocabulary > 0) out.stale.push("vocabulary");
  else compareValue("vocabulary", measured.vocabulary, 0, baseVocabulary > 0 ? baseVocabulary : undefined, out);

  const baseForbidden = baseline?.forbiddenFiles ?? [];
  for (const f of measured.forbiddenFiles) if (!baseForbidden.includes(f)) out.added.push(`forbiddenFiles: ${f}`);
  for (const f of baseForbidden) if (!measured.forbiddenFiles.includes(f)) out.stale.push(`forbiddenFiles:${f}`);

  for (const message of measured.features) out.added.push(`features: ${message}`);
  return out;
}

/** いまの数から基準線を作る（上限を超えたファイルは全部の数を載せる。並びはパスの順） */
export function baselineFrom(measured) {
  const files = {};
  for (const file of Object.keys(measured.files).sort()) {
    if (!overLimit(measured, file)) continue;
    files[file] = Object.fromEntries(FILE_METRICS.filter((m) => measured.files[file][m] !== undefined).map((m) => [m, measured.files[file][m]]));
  }
  const comments = Object.fromEntries(Object.keys(measured.comments).sort().map((file) => [file, measured.comments[file]]));
  return { version: 1, files, comments, vocabulary: measured.vocabulary, forbiddenFiles: [...measured.forbiddenFiles] };
}

/** 種類ごとの数と合計（進み具合の記録に写す） */
export function summarize(measured) {
  const fileList = Object.keys(measured.files);
  const sum = (metric) => fileList.reduce((n, f) => n + (measured.files[f][metric] ?? 0), 0);
  const over = (metric) => fileList.filter((f) => (measured.files[f][metric] ?? 0) > allowedOf(measured, f, metric)).length;
  const counts = {
    files: fileList.length,
    overBytes: over("bytes"),
    overAncestors: over("ancestors"),
    longLines: sum("longLines"),
    forbidden: sum("forbidden"),
    brokenRefs: sum("brokenRefs"),
    comments: Object.values(measured.comments).reduce((n, c) => n + c, 0),
    vocabulary: measured.vocabulary,
    forbiddenFiles: measured.forbiddenFiles.length,
    features: measured.features.length,
  };
  const total = Object.entries(counts).reduce((n, [key, c]) => (key === "files" ? n : n + c), 0);
  return { ...counts, total };
}
