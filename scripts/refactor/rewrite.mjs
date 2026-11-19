// 作り直しの移動で、ファイルの中の import の指定とパスの文字を書き換える（scripts/refactor/move.mjs が使う）。
// 書き換えるのは指定の文字だけで、並び・空白・コメントは触らない
import path from "node:path";

/** 移す前の別名（いまの tsconfig の paths） */
const OLD_ALIASES = [
  ["@shared/", "src/shared/"],
  ["@/", "src/renderer/src/"],
];
const TRY_EXT = [".ts", ".tsx", ".mts", ".mjs", ".js", ".css", ".json", ".svg"];
const CODE_EXT = /\.(ts|tsx|mts|mjs|js|cjs)$/;
const DROP_EXT = /\.(ts|tsx|mts)$/;

function splitQuery(spec) {
  const at = spec.indexOf("?");
  return at < 0 ? [spec, ""] : [spec.slice(0, at), spec.slice(at)];
}

/**
 * 旧の木で指定を解く。返すのは { path, folder, modules } か null（パッケージ・リポジトリの外・見つからない）。
 * 拡張子は TRY_EXT を試し、"./x.js" は x.ts / x.tsx に、フォルダは index.ts / index.tsx に当てる。node_modules の中は在るかを見ない
 */
export function resolveOld(importer, spec, exists) {
  const alias = OLD_ALIASES.find(([prefix]) => spec.startsWith(prefix));
  let base;
  if (alias) base = alias[1] + spec.slice(alias[0].length);
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), spec));
  else return null;
  if (base.startsWith("../")) return null;
  if (/(^|\/)node_modules\//.test(base)) return { path: base, folder: false, modules: true };
  if (exists(base)) return { path: base, folder: false, modules: false };
  if (base.endsWith(".js")) {
    for (const ext of [".ts", ".tsx"]) if (exists(base.slice(0, -3) + ext)) return { path: base.slice(0, -3) + ext, folder: false, modules: false };
  }
  for (const ext of TRY_EXT) if (exists(base + ext)) return { path: base + ext, folder: false, modules: false };
  for (const index of ["/index.ts", "/index.tsx"]) if (exists(base + index)) return { path: base + index, folder: true, modules: false };
  return null;
}

/** fromFile のフォルダから toPath への相対（"./" か "../" で始める） */
function relativeSpec(fromFile, toPath) {
  const rel = path.posix.relative(path.posix.dirname(fromFile), toPath);
  return rel.startsWith("../") ? rel : `./${rel}`;
}

/** 指定の書き方（拡張子を付けるか・フォルダで書くか）を、元の指定に合わせて新しい行き先へ写す */
function shapeOf(target, folder, originalBare, keepCodeExt) {
  const base = path.posix.basename(target);
  if (folder && /^index\.tsx?$/.test(base)) return path.posix.dirname(target);
  if (!CODE_EXT.test(target) || !DROP_EXT.test(target)) return target;
  const stem = target.replace(DROP_EXT, "");
  if (originalBare.endsWith(".js")) return keepCodeExt ? `${stem}.js` : stem;
  if (DROP_EXT.test(originalBare)) return target;
  return stem;
}

/**
 * 1 つの指定を書き換える。返すのは新しい指定（変えないなら null）。kind は "import"（import・vi.mock など）か "url"（CSS・HTML・new URL・import.meta.glob）。
 * - src の中の import: 同じフォルダなら "./名前"、src/shared の下なら "@shared/…"、ほかの src の下なら "@/…"（"../" と ".js" は付けない）
 * - src の外（scripts・mobile）の import: "@shared/…" はそのまま別名で、相対は相対のまま（拡張子の書き方も元のまま）
 * - url と、node_modules・src の外を指すもの: 新しい位置からの相対
 */
export function rewriteSpecifier(oldImporter, newImporter, spec, ctx, kind = "import") {
  const [bare, query] = splitQuery(spec);
  const hit = resolveOld(oldImporter, bare, ctx.exists);
  if (!hit) return null;
  const target = hit.modules ? hit.path : (ctx.byFrom.get(hit.path) ?? hit.path);
  if (newImporter === oldImporter && target === hit.path && !bare.startsWith("@/")) return null;
  const inSrc = newImporter.startsWith("src/");
  let out;
  if (kind === "url" || hit.modules || !target.startsWith("src/")) out = relativeSpec(newImporter, target);
  else if (!inSrc) {
    const shaped = shapeOf(target, hit.folder, bare, true);
    out = bare.startsWith("@shared/") && shaped.startsWith("src/shared/") ? `@shared/${shaped.slice("src/shared/".length)}` : relativeSpec(newImporter, shaped);
  } else {
    const shaped = shapeOf(target, hit.folder, bare, false);
    // フォルダで書く指定（index.ts）は下のフォルダを読むので、同じフォルダとして扱わない
    const sameFolder = shaped !== path.posix.dirname(target) && path.posix.dirname(shaped) === path.posix.dirname(newImporter);
    if (sameFolder) out = `./${path.posix.basename(shaped)}`;
    else if (shaped.startsWith("src/shared/")) out = `@shared/${shaped.slice("src/shared/".length)}`;
    else out = `@/${shaped.slice("src/".length)}`;
  }
  out += query;
  return out === spec ? null : out;
}

/** 拾う形（code: TS・JS、css、html）。どれも、グループ「spec」が指定の文字 */
const CODE_PATTERNS = [
  { re: /(\bfrom\s*)(["'])(?<spec>[^"'\n]+)\2/g, kind: "import" },
  { re: /(\bimport\s*)(["'])(?<spec>[^"'\n]+)\2/g, kind: "import" },
  { re: /(\bimport\s*\(\s*)(["'])(?<spec>[^"'\n]+)\2/g, kind: "import" },
  { re: /(\bvi\.(?:mock|doMock|unmock|importActual|importMock)\s*(?:<[^>()]*>)?\s*\(\s*)(["'])(?<spec>[^"'\n]+)\2/g, kind: "import" },
  { re: /(\bnew\s+URL\(\s*)(["'])(?<spec>[^"'\n]+)\2(?=\s*,\s*import\.meta\.url)/g, kind: "url" },
];
const GLOB = /(\bimport\.meta\.glob\s*(?:<[^>()]*>)?\(\s*)(\[[^\]]*\]|(["'])[^"'\n]+\3)/g;
const CSS_PATTERNS = [
  { re: /(@import\s+)(["'])(?<spec>[^"'\n]+)\2/g, kind: "url" },
  { re: /(\burl\(\s*)(["']?)(?<spec>[^"')\s]+)\2(?=\s*\))/g, kind: "url" },
];
const HTML_PATTERNS = [{ re: /(\b(?:src|href)\s*=\s*)(["'])(?<spec>[^"'\n]+)\2/g, kind: "url" }];

function patternsFor(file) {
  if (file.endsWith(".css")) return CSS_PATTERNS;
  if (file.endsWith(".html")) return HTML_PATTERNS;
  return CODE_EXT.test(file) ? CODE_PATTERNS : [];
}

/**
 * ファイル 1 つの中身を書き換える（oldPath・newPath はそのファイルの旧・新のパス）。
 * 文字の中のほかのパス（テストの例など）は触らない（reportLeftovers で出す）。onRewrite は書き換えた指定ごとに、onUnresolved は解けない相対・別名の指定ごとに呼ぶ
 */
export function rewriteSource(oldPath, newPath, text, ctx, onRewrite = () => {}, onUnresolved = () => {}) {
  const one = (spec, kind) => {
    const next = rewriteSpecifier(oldPath, newPath, spec, ctx, kind);
    if (next !== null) onRewrite(spec, next);
    else if (/^(\.\.?\/|@\/|@shared\/)/.test(spec) && !resolveOld(oldPath, splitQuery(spec)[0], ctx.exists)) onUnresolved(spec);
    return next ?? spec;
  };
  let out = text;
  for (const { re, kind } of patternsFor(oldPath)) {
    out = out.replace(re, (...args) => {
      const [whole, head, quote] = args;
      const spec = args.at(-1).spec;
      return `${head}${quote}${one(spec, kind)}${quote}${whole.slice(head.length + quote.length * 2 + spec.length)}`;
    });
  }
  if (CODE_EXT.test(oldPath)) {
    out = out.replace(GLOB, (whole, head, arg) => `${head}${arg.replace(/(["'])([^"'\n]+)\1/g, (m, q, spec) => `${q}${one(spec, "url")}${q}`)}`);
  }
  return out;
}

/** 移す前のパス（src/core/・src/main/・src/preload/・src/renderer/ と、画面の root からの /src/…） */
const LEFTOVER = /(?<![\w-]|mobile\/)src\/(core|main|preload|renderer)\/|["'`(]\/src\/(lib|hooks|ui|app|features|stores|api|styles)\//;

/** 書き換えたあとの木に、移す前のパスが残っている所（直すのは人） */
export function reportLeftovers(files, read) {
  const found = [];
  for (const file of files) {
    read(file)
      .split("\n")
      .forEach((text, i) => {
        if (LEFTOVER.test(text)) found.push({ file, line: i + 1, text: text.trim().slice(0, 200) });
      });
  }
  return found;
}
