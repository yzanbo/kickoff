// コードの色付け（Shiki）で色を付ける言語の名前の一覧。色付けのライブラリを読み込まずに使える（Worker に頼む前に、色を付けない言語を見分ける）

/** 色を付ける言語（よく使うものだけ。言語の定義は Worker の中で使うときに読み込む。lib/highlightCore.ts） */
const HIGHLIGHT_LANGUAGES = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "jsonc",
  "css",
  "scss",
  "html",
  "vue",
  "svelte",
  "markdown",
  "yaml",
  "toml",
  "xml",
  "shellscript",
  "python",
  "ruby",
  "go",
  "rust",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "php",
  "sql",
  "dockerfile",
  // ツールの行と結果（検索の正規表現・コマンドの出力の差分とログ）
  "regexp",
  "diff",
  "log",
] as const;

export type HighlightLanguage = (typeof HIGHLIGHT_LANGUAGES)[number];

const KNOWN: ReadonlySet<string> = new Set(HIGHLIGHT_LANGUAGES);

/** 色を付ける言語か */
export const isHighlightLanguage = (lang: string | undefined): lang is HighlightLanguage => lang !== undefined && KNOWN.has(lang);
