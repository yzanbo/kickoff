// メモの親フォルダの既定の場所（~/Documents/kickoff。開発版は kickoff-dev）と、前の既定（~/Documents/<アプリ名> メモ）からの引っ越し
import fs from "node:fs";
import path from "node:path";
import { defaultMemosFolderName } from "@shared/memo/names";
import { expandHome, isInside } from "../system/paths.js";

/** 既定の親フォルダ（保存先のフォルダ名がアプリ名。空白を入れない小文字の名前にする。開発版は製品版のメモに触らない） */
export function defaultMemosDir(dataDir: string, documentsDir: string): string {
  return path.join(documentsDir, defaultMemosFolderName(path.basename(dataDir)));
}

/** 前の既定の親フォルダ（「<アプリ名> メモ」。パスに空白が入るのでやめた） */
export function legacyMemosDir(dataDir: string, documentsDir: string): string {
  return path.join(documentsDir, `${path.basename(dataDir)} メモ`);
}

/**
 * 前の既定のフォルダにメモがあり、新しい既定のフォルダがまだなければ、フォルダごと名前を変えて引き継ぐ（中のメモ・プロジェクトのフォルダはそのまま）。
 * 新しい既定のフォルダがもうあれば、混ぜないよう何もしない。移したら true
 */
export function adoptLegacyMemosDir(from: string, to: string): boolean {
  if (!fs.existsSync(from) || fs.existsSync(to)) return false;
  try {
    fs.renameSync(from, to);
    return true;
  } catch (e) {
    console.warn(`[core] 前のメモのフォルダを ${to} へ移せませんでした`, e);
    return false;
  }
}

/** from の中を指すパス（~ も展開して比べる）を、to の中の同じ場所にする。from の外なら null（引き継いだフォルダを指していたプロジェクトのメモの場所の付け替え） */
export function movedPath(p: string, from: string, to: string): string | null {
  const full = expandHome(p);
  return isInside(from, full) ? path.join(to, path.relative(from, full)) : null;
}
