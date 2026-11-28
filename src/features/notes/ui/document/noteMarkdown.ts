// ノートの Markdown の読み取りの組（編集の部品とテスト・純粋な関数で同じものを使う）
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownConfig, MarkdownParser } from "@lezer/markdown";
import { cjkFriendlyEmphasis } from "./cjkEmphasis";
import { tableAfterPipeLines } from "./tableSyntax";

/** 返答の表示と同じに読むための拡張（日本語向けの強調・段落の途中から始まる表） */
export const NOTE_MARKDOWN_EXTENSIONS: MarkdownConfig[] = [cjkFriendlyEmphasis, tableAfterPipeLines];

/** 編集の部品（markdown({ base: markdownLanguage, extensions })）と同じ読み取り */
export const noteMarkdownParser: MarkdownParser = (markdownLanguage.parser as MarkdownParser).configure(NOTE_MARKDOWN_EXTENSIONS);
