import { createContext } from "react";
import type { FileIndex, FileRef } from "./fileRefs";

/** Markdown の中のファイルのパスを、押して開けるチップにするための情報（チャットのパネルが入れる） */
export interface FileLinks {
  /** チャットの作業場所のファイルの一覧（ここにあるものだけをチップにする） */
  index: FileIndex;
  /** エディタタブでファイルを開く */
  open: (ref: FileRef) => void;
}

/** ないとき（チャット以外の画面）は、今までどおりチップにしない */
export const FileLinkContext = createContext<FileLinks | undefined>(undefined);
