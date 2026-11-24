// 文書の検査（scripts/check-docs.mjs）の数え方: 読んだ中身から違反を数える（1 つでもあればコミットを止める）。
// 入出力をしない純粋な関数（テストは scripts/check-docs.test.mjs）
import { matchesAny } from "../structure/parse.mjs";
import { countForbidden, headingRefsIn, headingsOf, longLinesIn, pathRefsIn, refExists, resolveRef, vocabularyNames } from "./markdown.mjs";
import { ancestorDocs, checkFeatures, commentViolations, limitFor, missingNames, orderErrors } from "./rules.mjs";

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
export function measureDocs({ docs, markdown = docs, code = new Map(), files, config, only = null }) {
  const limits = config.limits ?? [];
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
  // 設計書の機能の表の並び（誤りは機能の一覧の誤りに数える）
  const order = config.featureOrder;
  if (order && markdown.has(order.file)) {
    const errors = orderErrors(markdown.get(order.file), order);
    measured.features.push(...errors);
    for (const message of errors) detail("features", order.file, message);
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

/** 大きさ・祖先との合計の上限（決まっていなければ見ない） */
function limitOf(measured, file, metric) {
  return measured.limits[file]?.[metric] ?? Infinity;
}

/** 種類ごとの数と合計（total が 0 でなければ検査は落ちる） */
export function summarize(measured) {
  const fileList = Object.keys(measured.files);
  const sum = (metric) => fileList.reduce((n, f) => n + (measured.files[f][metric] ?? 0), 0);
  const over = (metric) => fileList.filter((f) => (measured.files[f][metric] ?? 0) > limitOf(measured, f, metric)).length;
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
