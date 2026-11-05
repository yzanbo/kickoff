import { createContext, type MouseEvent } from "react";
import type { FileIndex, FileRef } from "./fileRefs";

/**
 * チャットの中のファイル（返答のファイルのパスのチップ・ターンの変更カード・ツールの行・右の欄の変更）を押して開くための情報（チャットのパネルが入れる）。
 * パスは作業場所からの相対パス
 */
export interface FileLinks {
  /** チャットの作業場所のファイルの一覧（ここにあるものだけをチップにする。root は作業場所のフォルダ） */
  index: FileIndex;
  /**
   * 押したとき: 右の欄があれば右の欄（行の番号があればファイルのタブでその行、コミットしていない変更があれば変更のタブのそのファイルの位置、
   * なければファイルのタブ）。右の欄がなければエディタタブ
   */
  open: (ref: FileRef) => void;
  /** エディタタブで開く（⌘クリック・右クリックのメニュー・右の欄の「エディタタブで開く」） */
  openInEditor: (ref: FileRef) => void;
  /** 右の欄の変更のタブを開く（focus のファイルの位置へ。右の欄がなければエディタタブ） */
  openChanges: (focus?: string) => void;
  /** 右の欄に開くか（右クリックのメニューに「右の欄で開く」を出すか） */
  side: boolean;
  /** 右クリックのメニュー（右の欄で開く・エディタタブで開く・外のアプリで開く・パスのコピー・Finder で表示。FileLinksProvider が描く） */
  showMenu: (e: MouseEvent, ref: FileRef) => void;
}

/** ないとき（チャット以外の画面）は、今までどおりチップにしない */
export const FileLinkContext = createContext<FileLinks | undefined>(undefined);

/** 押したとき: ⌘ を押しながらならエディタタブ、そうでなければ open（右の欄） */
export function openByClick(links: FileLinks, e: MouseEvent, ref: FileRef) {
  if (e.metaKey) links.openInEditor(ref);
  else links.open(ref);
}
