/**
 * Markdown の読み方の設定の組。表示（markdownProcessor.ts の pipelineOf）と書式付きコピー（markdownHtml.ts）が同じものを使う
 * （別々に組むと、表示とコピーで読み方がずれていくため）
 */
import type { Options } from "react-markdown";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import { remarkGfmParts } from "./remarkGfmParts";

type PluggableList = NonNullable<Options["remarkPlugins"]>;

/** 読み方の部品（GitHub の書き方） */
const SYNTAX: PluggableList = [remarkGfmParts];

/**
 * remark のプラグインの組。extra（数式・ファイルのチップの差し込みなど、画面ごとに足すもの）は読み方の部品の後ろに入れる
 */
export function markdownRemarkPlugins(extra: PluggableList = []): PluggableList {
  return [...SYNTAX, ...extra];
}

/** mdast から hast にするときの決まり（生の HTML は木に残し、描く前に文字にする。react-markdown と同じ） */
export const REMARK_REHYPE_OPTIONS: RemarkRehypeOptions = { allowDangerousHtml: true };
