import { createContext, type MouseEvent } from "react";
import type { Options } from "react-markdown";

/**
 * Markdown の中のファイルのパスを、押して開けるチップにする口（ここはドメインを知らない。中身はチャットのパネルが
 * features/fileLinks の FileLinksProvider で入れる）。ないとき（チャット以外の画面）は、ふつうの文のまま
 */
export interface MarkdownFileLinks {
  /**
   * 文の中のファイルのパスらしいものに data-file-path（と data-file-line・地の文なら元の文字 data-file-text）を付ける remark のプラグイン。
   * 開けるファイルの一覧は入れない（一覧が変わるたびに、すべての返答を解析し直すことになるため）。設定は作業場所が同じ間は同じ物
   */
  remarkPlugin: NonNullable<Options["remarkPlugins"]>[number];
  /** 印を付けたパスを、いま開けるファイルのパスに引き当てる（開けなければ undefined。チップにせず元のまま出す） */
  resolve: (path: string) => string | undefined;
  /** 開けるファイルの一覧が変わったら知らせる（リンクは自分の引き当ての結果だけを読み直す） */
  subscribe: (onChange: () => void) => () => void;
  /** チップを押したときに開く（⌘ を押しながらかどうかは、渡す側が e で見る） */
  open: (e: MouseEvent, path: string, line?: number) => void;
  /** チップの右クリック（開き方・パスのコピーなどのメニュー） */
  menu: (e: MouseEvent, path: string, line?: number) => void;
  /** チップに乗せたときの説明 */
  title: (path: string, line?: number) => string;
}

export const MarkdownFileLinksContext = createContext<MarkdownFileLinks | undefined>(undefined);
