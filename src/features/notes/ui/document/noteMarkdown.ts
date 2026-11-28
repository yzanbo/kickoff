// ノートの Markdown の読み取りの組（編集の部品とテスト・純粋な関数で同じものを使う）
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownConfig, MarkdownParser } from "@lezer/markdown";
import { cjkFriendlyEmphasis } from "./cjkEmphasis";
import { tableAfterPipeLines } from "./tableSyntax";

/**
 * 返答の表示と同じに読むための拡張（日本語向けの強調・段落の途中から始まる表）。上付き・下付き（^x^・~x~）と :絵文字: は
 * 返答の表示が読まない書き方なので外す（[^1] の脚注の印や ~ を含む文の読み方を崩すため）
 */
export const NOTE_MARKDOWN_EXTENSIONS: MarkdownConfig[] = [cjkFriendlyEmphasis, tableAfterPipeLines, { remove: ["Superscript", "Subscript", "Emoji"] }];

/** 編集の部品（markdown({ base: markdownLanguage, extensions })）と同じ読み取り */
export const noteMarkdownParser: MarkdownParser = (markdownLanguage.parser as MarkdownParser).configure(NOTE_MARKDOWN_EXTENSIONS);
