import type { HighlighterCore, LanguageRegistration } from "shiki/core";
import type { AppliedTheme } from "./theme";

/** 色付きの断片（fontStyle は 1: 斜体 / 2: 太字 / 4: 下線 の足し算） */
export interface CodeToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

/** これより長いコードは色を付けない（重くならないように） */
const MAX_CHARS = 300_000;

type Loader = () => Promise<{ default: LanguageRegistration[] }>;

/** 色を付ける言語（よく使うものだけ。言語の定義は使うときに読み込む） */
const LANGUAGES: Record<string, Loader> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  svelte: () => import("shiki/langs/svelte.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
};

/** 拡張子 → 言語 */
const EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  vue: "vue",
  svelte: "svelte",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  php: "php",
  sql: "sql",
};

/** ファイルのパスから言語を決める（色を付けない種類なら undefined） */
export function languageOf(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name === "Dockerfile") return "dockerfile";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? EXTENSIONS[name.slice(dot + 1).toLowerCase()] : undefined;
}

// 色付けのライブラリは大きいので、使うときに初めて読み込む。配色は VS Code の Dark+ / Light+
let loading: Promise<HighlighterCore> | undefined;
const loadHighlighter = () =>
  (loading ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/themes/dark-plus.mjs"),
    import("shiki/themes/light-plus.mjs"),
  ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }, dark, light]) =>
    // WASM を使わない正規表現のエンジン（扱えない書き方は飛ばす）
    createHighlighterCore({ themes: [dark.default, light.default], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) }),
  ));

/** コードを行ごとの色付きの断片にする。色を付けない種類・長すぎるコードは null */
export async function highlightLines(code: string, path: string, theme: AppliedTheme): Promise<CodeToken[][] | null> {
  const lang = languageOf(path);
  if (!lang || code.length > MAX_CHARS) return null;
  const highlighter = await loadHighlighter();
  if (!highlighter.getLoadedLanguages().includes(lang)) await highlighter.loadLanguage((await LANGUAGES[lang]()).default);
  const { tokens } = highlighter.codeToTokens(code, { lang, theme: theme === "dark" ? "dark-plus" : "light-plus" });
  return tokens.map((line) => line.map(({ content, color, fontStyle }) => ({ content, color, fontStyle })));
}
