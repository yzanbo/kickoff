// 構造の検査（scripts/check-structure.mjs）の読み方: glob・import の読み方・行き先の解き方・import のグラフ。
// 正規表現でなく構文木（oxc-parser）で読むのは、型だけの import を見分け、文字やコメントの中の「from "…"」を拾わないため
import path from "node:path";
import { parseSync } from "oxc-parser";

/** import を読むファイル（CSS などは大きさ・クラスの検査だけで見る） */
const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export function isCodeFile(file) {
  return CODE_FILE.test(file);
}

/** glob を正規表現にする。使えるのは `**`（0 個以上のフォルダ）・`*`（/ をまたがない）・`?`・`{a,b}` だけ */
export function globToRegExp(glob) {
  let out = "";
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      // 「**/」は 0 個以上のフォルダ、それ以外の「**」は何でも
      if (glob[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else if (c === "{") {
      braces++;
      out += "(?:";
    } else if (c === "}" && braces > 0) {
      braces--;
      out += ")";
    } else if (c === "," && braces > 0) out += "|";
    else out += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

const globCache = new Map();

function compiled(glob) {
  let re = globCache.get(glob);
  if (!re) {
    re = globToRegExp(glob);
    globCache.set(glob, re);
  }
  return re;
}

export function matchesAny(file, globs) {
  return globs.some((glob) => compiled(glob).test(file));
}

/** 決まりの中の名前（層の名前か glob）を glob の並びにする */
export function expandLayers(names, layers) {
  return names.flatMap((name) => layers[name] ?? [name]);
}

/** 引用符で囲まれた文字の値なら中身を返す（動的な import の行き先。式なら null） */
function literalText(raw) {
  const m = /^(["'])(.*)\1$/s.exec(raw) ?? /^`([^`$]*)`$/s.exec(raw);
  if (!m) return null;
  return m.length === 3 ? m[2] : m[1];
}

/**
 * ファイルの import を並べる（静的な import・`export … from`・文字で書いた `import("…")`）。
 * typeOnly は、取り込む名前がすべて型のとき（`import type`・`import { type X }`・`export type … from`）
 */
export function parseImports(file, source) {
  const result = parseSync(file, source);
  const errors = result.errors.filter((e) => e.severity === "Error");
  if (errors.length > 0) throw new Error(`${file}: 読めません（${errors[0].message}）`);
  const found = [];
  for (const imp of result.module.staticImports) {
    const typeOnly = imp.entries.length > 0 && imp.entries.every((e) => e.isType);
    found.push({ specifier: imp.moduleRequest.value, typeOnly, dynamic: false });
  }
  for (const exp of result.module.staticExports) {
    const entries = exp.entries.filter((e) => e.moduleRequest);
    if (entries.length === 0) continue;
    found.push({ specifier: entries[0].moduleRequest.value, typeOnly: entries.every((e) => e.isType), dynamic: false });
  }
  for (const dyn of result.module.dynamicImports) {
    const specifier = literalText(source.slice(dyn.moduleRequest.start, dyn.moduleRequest.end).trim());
    if (specifier !== null) found.push({ specifier, typeOnly: false, dynamic: true });
  }
  return found;
}

/** パッケージの名前（`node:fs` → `node:fs`、`@scope/pkg/sub` → `@scope/pkg`、`pkg/sub` → `pkg`） */
function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * import の行き先をリポジトリの中のファイルに解く。別名 → 相対 → 拡張子（`.js` を外して `.ts`・`.tsx`・`/index.ts`・`/index.tsx`・そのまま）の順。
 * `?raw` などの後ろは外す。リポジトリの中に見つからないもの・パッケージは { module }
 */
export function resolveSpecifier(from, specifier, ctx) {
  const bare = specifier.replace(/\?.*$/, "");
  let target = null;
  const alias = Object.keys(ctx.aliases)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => bare.startsWith(prefix));
  if (alias) target = ctx.aliases[alias] + bare.slice(alias.length);
  else if (bare.startsWith("./") || bare.startsWith("../")) target = path.posix.join(path.posix.dirname(from), bare);
  if (target === null) return { module: packageName(bare) };
  // 相対で node_modules の中を指すもの（monaco-editor の言語など）はパッケージとして扱う
  const inModules = target.lastIndexOf("node_modules/");
  if (inModules >= 0) return { module: packageName(target.slice(inModules + "node_modules/".length)) };
  const base = target.endsWith(".js") ? target.slice(0, -3) : target;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, target]) {
    if (ctx.files.has(candidate)) return { path: candidate };
  }
  // Git が知らないファイル（作って .gitignore したもの）は、リポジトリの中のパスを名前にする
  return { module: target };
}

/**
 * import のグラフ（読む側のファイル → 行き先の並び）。sources はコードのファイルの中身、files は行き先を探す全部のファイル。
 * 同じ行き先を 2 回読むときは 1 本にまとめ、どちらかが値も読むなら typeOnly にしない
 */
export function buildGraph(sources, config, files = new Set(sources.keys())) {
  const ctx = { aliases: config.aliases ?? {}, files };
  const graph = new Map();
  for (const [file, source] of sources) {
    if (!isCodeFile(file)) continue;
    const edges = new Map();
    for (const imp of parseImports(file, source)) {
      const resolved = resolveSpecifier(file, imp.specifier, ctx);
      const id = resolved.path ?? `module:${resolved.module}`;
      const prev = edges.get(id);
      edges.set(id, { ...resolved, typeOnly: prev ? prev.typeOnly && imp.typeOnly : imp.typeOnly });
    }
    graph.set(file, [...edges.values()]);
  }
  return graph;
}
