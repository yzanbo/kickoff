import { createContext, type ReactNode } from "react";

/** Markdown の画像 1 つを描くのに渡すもの */
export interface MarkdownImageProps {
  src: string;
  alt?: string;
  title?: string;
  /** 同じ Markdown の文に書かれた画像の src（書いた順。「host から画像を n 件表示」の数と URL の一覧に使う） */
  sources: readonly string[];
}

/**
 * Markdown の画像の描き方を差し込む口（ここはドメインを知らない。中身はチャットの画面が features/chat/images の ChatImagesProvider で入れる。
 * メモの仕様書「0027_チャット欄の外の画像とリンク」）。ないとき（チャット以外の画面）は、ふつうの img のまま（外の画像は画面の CSP が止める）
 */
export interface MarkdownImages {
  render: (props: MarkdownImageProps) => ReactNode;
}

export const MarkdownImagesContext = createContext<MarkdownImages | null>(null);

/** 同じ Markdown の文に書かれた画像の src（MarkdownBody が文から作って配る） */
export const MarkdownImageSourcesContext = createContext<readonly string[]>([]);
