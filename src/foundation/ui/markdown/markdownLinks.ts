import { createContext, type MouseEvent } from "react";

/**
 * Markdown の外部リンク（http・https。読み直した URL）を押したときに開く口（ここはドメインを知らない。中身は App・別ウィンドウが
 * foundation/ui/external の LinkOpenerProvider で入れる）。ないときは押しても何もしない（新しいウィンドウの要求ではメインプロセスは開かない）
 */
export type MarkdownLinkOpener = (e: MouseEvent, href: string, text: string) => void;

export const MarkdownLinkOpenerContext = createContext<MarkdownLinkOpener | null>(null);
