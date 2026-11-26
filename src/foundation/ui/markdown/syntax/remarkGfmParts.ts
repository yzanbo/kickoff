/**
 * GitHub の書き方（表・取り消し線・脚注・チェックリスト・URL の自動リンク）を読む remark のプラグイン。
 * remark-gfm 4.0.1 と同じ部品を同じ順に入れる（micromark の読み取りと mdast への組み立て）。
 * URL の自動リンクだけは、日本語の文の記号の手前で終える版（`gfmAutolink.ts`）に差し替える。部品の版は package.json で固定してある
 */
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote";
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTaskListItemFromMarkdown } from "mdast-util-gfm-task-list-item";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmStrikethrough, type Options as StrikethroughOptions } from "micromark-extension-gfm-strikethrough";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import type { Processor } from "unified";
import { gfmAutolinkFromMarkdown, gfmAutolinkSyntax } from "./gfmAutolink";

/** 取り消し線の決まり（remark-gfm の options と同じ。singleTilde） */
export type GfmPartsOptions = StrikethroughOptions;

export function remarkGfmParts(this: Processor, options: GfmPartsOptions = {}) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfmAutolinkSyntax(), gfmFootnote(), gfmStrikethrough(options), gfmTable(), gfmTaskListItem());
  (data.fromMarkdownExtensions ??= []).push(
    gfmAutolinkFromMarkdown(),
    gfmFootnoteFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    gfmTaskListItemFromMarkdown(),
  );
}
