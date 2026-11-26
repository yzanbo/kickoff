// 会話の画面がファイルのリンクを使う口（拡張点 chatFileLinks。files が 1 つだけ登録する）。
// 返答のファイルのチップ・ターンの変更カード・ツールの行・右の欄の変更が、押して開く・右クリックのメニューを読む
import { createContext, useContext, type ComponentType, type MouseEvent, type ReactNode } from "react";
import type { ProjectFiles } from "@shared/foundation/fileTypes";
import { definePoint } from "@/foundation/ui/points";

/** 作業場所からの相対パスと行 */
export interface ChatFileRef {
  path: string;
  line?: number;
}

/** チャットの中のファイルを押して開く口（ChatFileLinksPort の Provider が配る） */
export interface ChatFileLinks {
  /** 作業場所のフォルダ（この中のパスだけをリンクにする） */
  root: string;
  /** 押したとき: 右の欄があれば右の欄（行の番号があればファイルのタブ、コミットしていない変更があれば変更のタブ）、なければファイルタブ（共通のチャットは別ウィンドウ） */
  open: (ref: ChatFileRef) => void;
  /** ファイルタブで開く（⌘クリック・右クリックのメニュー・右の欄の「ファイルタブで開く」）。null = ファイルタブがない（共通のチャット。⌘クリックも open と同じ） */
  openInEditor: ((ref: ChatFileRef) => void) | null;
  /** 右の欄の変更のタブを開く（focus のファイルの位置へ。右の欄がなければファイルタブ） */
  openChanges: (focus?: string) => void;
  /** 右の欄に開くか */
  side: boolean;
  /** 右クリックのメニュー（開き方・外のアプリ・パスのコピー） */
  showMenu: (e: MouseEvent, ref: ChatFileRef) => void;
}

/** files が作るリンクの元（作業場所のファイルの一覧と開き方。中身は files だけが読む） */
export interface ChatFileSource {
  readonly side: boolean;
}

/** チャットの場所（作業場所のファイルの一覧を読む・開く先） */
export interface ChatFilePlace {
  chatId: number;
  projectId: number;
  worktree: string | undefined;
  /** 作業場所のフォルダ（読めなければ undefined） */
  root: string | undefined;
  side: boolean;
}

export interface ChatFileLinksPort {
  /** source のリンクを中に配る（Markdown のファイルのパスもこの中で効く）。source がなければリンクにしない */
  Provider: ComponentType<{ source: ChatFileSource | undefined; children: ReactNode }>;
  /** いまの作業場所のリンクの元（version が変わるたびに一覧を読み直す） */
  useSource(place: ChatFilePlace, version: unknown): ChatFileSource | undefined;
  /** 読んだ一覧からリンクの元を作る（作業場所を移す前の作業場所） */
  sourceFor(place: ChatFilePlace & { root: string }, files: ProjectFiles): ChatFileSource;
  /** そのときの作業場所がもうないときの元（チップはいまの一覧の名前で出し、押すと tell） */
  goneSource(current: ChatFileSource, root: string | undefined, tell: () => void): ChatFileSource;
  /** 別ウィンドウの開き方に直す */
  popout(source: ChatFileSource, place: { chatId: number; projectId: number; worktree?: string }): ChatFileSource;
}

export const chatFileLinks = definePoint<ChatFileLinksPort>("chatFileLinks");

const NO_FILE_LINKS: ChatFileLinksPort = {
  Provider: ({ children }) => children,
  useSource: () => undefined,
  sourceFor: (place) => ({ side: place.side }),
  goneSource: (current) => current,
  popout: (source) => source,
};

/** 登録された口（なければリンクにしない口） */
export const chatFileLinksPort = (): ChatFileLinksPort => chatFileLinks.items()[0] ?? NO_FILE_LINKS;

/** いまの作業場所のリンクの元（登録がなければ undefined。部品は口の useSource を直に呼ばずにこれを呼ぶ） */
export function useChatFileSource(place: ChatFilePlace, version: unknown): ChatFileSource | undefined {
  return chatFileLinksPort().useSource(place, version);
}

/** 配る入れ物（files の Provider が値を入れる） */
export const ChatFileLinksContext = createContext<ChatFileLinks | undefined>(undefined);

/** チャットの中のファイルのリンク（チャットの外・登録がなければ undefined = リンクにしない） */
export const useChatFileLinks = (): ChatFileLinks | undefined => useContext(ChatFileLinksContext);

/** 押したとき: ⌘ を押しながらならファイルタブ（なければ open）、そうでなければ open（右の欄） */
export function openByClick(links: ChatFileLinks, e: MouseEvent, ref: ChatFileRef) {
  if (e.metaKey && links.openInEditor) links.openInEditor(ref);
  else links.open(ref);
}
