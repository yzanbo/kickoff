import { createContext, type MouseEvent } from "react";

/**
 * Markdown の外部リンク（http・https）を押したときに開く口（ここはドメインを知らない。中身は App・別ウィンドウが features/browser の
 * LinkOpenerProvider で入れる）。ないときは、ふつうのリンクのまま（メインプロセスが既定のブラウザで開く）
 */
export type MarkdownLinkOpener = (e: MouseEvent, href: string, text: string) => void;

export const MarkdownLinkOpenerContext = createContext<MarkdownLinkOpener | null>(null);
