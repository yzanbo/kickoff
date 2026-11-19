// メモの親フォルダの既定の場所（~/Documents/kickoff。開発版は kickoff-dev）
import path from "node:path";
import { defaultMemosFolderName } from "@shared/memo/names";

/** 既定の親フォルダ（保存先のフォルダ名がアプリ名。空白を入れない小文字の名前にする。開発版は製品版のメモに触らない） */
export function defaultMemosDir(dataDir: string, documentsDir: string): string {
  return path.join(documentsDir, defaultMemosFolderName(path.basename(dataDir)));
}
