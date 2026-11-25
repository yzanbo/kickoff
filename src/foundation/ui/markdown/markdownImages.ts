import type { Element, Root } from "hast";
import { createContext, type ReactNode } from "react";

/** Markdown の画像 1 つを描くのに渡すもの */
export interface MarkdownImageProps {
  src: string;
  alt?: string;
  title?: string;
  /** 同じ所（文の全体か、たたむ部分の中）に描く画像の src（描く木の順。「host から画像を n 件表示」の数と URL の一覧に使う） */
  sources: readonly string[];
}

/**
 * Markdown の画像の描き方を差し込む口（ここはドメインを知らない。中身はチャットの画面が features/chat/images の ChatImagesProvider で入れる）。
 * ないとき（チャット以外の画面）は、ふつうの img のまま（外の画像は画面の CSP が止める）
 */
export interface MarkdownImages {
  render: (props: MarkdownImageProps) => ReactNode;
}

export const MarkdownImagesContext = createContext<MarkdownImages | null>(null);

/** 同じ所に描く画像の src（MarkdownBody が描く木から作って配る。たたむ部分の中は、その部分が自分の分を配る） */
export const MarkdownImageSourcesContext = createContext<readonly string[]>([]);

/**
 * 描く木の画像の src（木の順。Markdown の画像も HTML の img も入る）。たたむ部分（details）の中は数えない（閉じている間は描かないので、
 * 数に入れると最初の画像のボタンが見えない所に出る。中の画像はその部分を開いたときに、その部分の分として数える。MarkdownDetails.tsx）
 */
export function imageSourcesOf(node: Root | Element, out: string[] = []): string[] {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "img" && typeof child.properties.src === "string" && child.properties.src) out.push(child.properties.src);
    if (child.tagName !== "details") imageSourcesOf(child, out);
  }
  return out;
}
