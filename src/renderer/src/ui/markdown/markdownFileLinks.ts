import { createContext } from "react";
import type { Options } from "react-markdown";

/**
 * Markdown の中のファイルのパスを、押して開けるチップにする口（ここはドメインを知らない。中身はチャットのパネルが
 * features/fileLinks の FileLinksProvider で入れる）。ないとき（チャット以外の画面）は、ふつうの文のまま
 */
export interface MarkdownFileLinks {
  /** 文の中のファイルのパスに data-file-path（と data-file-line）を付ける remark のプラグイン */
  remarkPlugin: NonNullable<Options["remarkPlugins"]>[number];
  /** チップを押したときに開く */
  open: (path: string, line?: number) => void;
}

export const MarkdownFileLinksContext = createContext<MarkdownFileLinks | undefined>(undefined);
