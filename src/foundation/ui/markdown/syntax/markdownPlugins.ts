/**
 * Markdown の読み方の設定の組。表示（markdownProcessor.ts の pipelineOf）が使う
 * （読み方を変えるときはここだけを直す）
 */
import type { Options } from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import { remarkGfmParts } from "./remarkGfmParts";

type PluggableList = NonNullable<Options["remarkPlugins"]>;

/**
 * 読み方の部品: GitHub の書き方と、日本語向けに緩めた強調・取り消し線の決まり（markdown-cjk-friendly。**「強調」**は のように、
 * 印の内側が記号で外側が日本語でも開き・閉じとして読む。英語の文の読み方は変わらない）。日本語向けの部品は GFM の後ろに置く
 * （同じ印の読み取りを先に試す側に入れるため）
 */
const SYNTAX: PluggableList = [
  // 取り消し線は ~~ だけ（GFM の既定は ~ 1 つも取り消し線にするので、5~10秒、20~30秒 の間に線が引かれる）。
  // 取り消し線の読み取りは GFM と日本語向けの 2 つがあり、片方だけ止めても残るほうが読むので両方に渡す
  [remarkGfmParts, { singleTilde: false }],
  remarkCjkFriendly,
  [remarkCjkFriendlyGfmStrikethrough, { singleTilde: false }],
];

/**
 * remark のプラグインの組。extra（数式・ファイルのチップの差し込みなど、画面ごとに足すもの）は読み方の部品の後ろに入れる
 */
export function markdownRemarkPlugins(extra: PluggableList = []): PluggableList {
  return [...SYNTAX, ...extra];
}

/**
 * mdast から hast にするときの決まり（生の HTML は木に残し、描く前に文字にする。react-markdown と同じ）。
 * 脚注の見出しは画面に出さず読み上げにだけ残す（sr-only。Markdown.css）ので、文言は読み上げる日本語にする
 */
export const REMARK_REHYPE_OPTIONS: RemarkRehypeOptions = {
  allowDangerousHtml: true,
  footnoteLabel: "脚注",
  // 同じ注を何度も指したときは 2 回目から「-2」のように数を足す（remark-rehype の既定と同じ数え方）
  footnoteBackLabel: (referenceIndex, rereferenceIndex) => `本文の注 ${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ""} へ戻る`,
};
