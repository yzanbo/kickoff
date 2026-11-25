/**
 * GitHub の書き方（表・取り消し線・脚注・チェックリスト・URL の自動リンク）を読む remark のプラグイン。
 * remark-gfm 4.0.1 と同じ部品を同じ順に入れる（micromark の読み取りと mdast への組み立て）。
 * remark-gfm を使わずに部品から組むのは、自動リンクの部品だけを差し替えられるようにするため。部品の版は package.json で固定してある
 */
import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal";
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote";
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTaskListItemFromMarkdown } from "mdast-util-gfm-task-list-item";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmStrikethrough, type Options as StrikethroughOptions } from "micromark-extension-gfm-strikethrough";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import type { Processor } from "unified";

/** 取り消し線の決まり（remark-gfm の options と同じ。singleTilde） */
export type GfmPartsOptions = StrikethroughOptions;

export function remarkGfmParts(this: Processor, options: GfmPartsOptions = {}) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfmAutolinkLiteral(), gfmFootnote(), gfmStrikethrough(options), gfmTable(), gfmTaskListItem());
  (data.fromMarkdownExtensions ??= []).push(
    gfmAutolinkLiteralFromMarkdown(),
    gfmFootnoteFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    gfmTaskListItemFromMarkdown(),
  );
}
