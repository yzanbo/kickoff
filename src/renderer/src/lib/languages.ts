// ファイルの種類（拡張子）から、コードの色付けの言語（lib/highlight の言語の名前）を決める。
// 色付けのライブラリ（Shiki）を読み込まずに使える（ファイルのアイコン・heredoc の本文の言語など）

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
