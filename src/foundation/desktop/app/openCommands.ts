import fs from "node:fs";
import path from "node:path";

// アプリの外で開くときの、OS に依らない補助（フォルダ・ファイルの確かめ・VS Code の URL）。OS ごとの開き方は platform/
// Electron に依らないので、テストできる（実行は app/externalApps.ts）

/** 外部のターミナルで開くフォルダか確かめる（いまあるフォルダ。ワークツリーが消されたなどでなければ） */
export function existingFolder(dir: string): string {
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`フォルダが見つかりません: ${dir}`);
  return dir;
}

/**
 * クリップボードに入れるファイルか確かめ、解決したパスを返す（画面から届いたパスは信じない。いまあるファイルだけで、フォルダ・ないパスは断る。
 * 貼った先が空のファイルや別の物を受け取らないように）
 */
export function existingFile(file: string): string {
  const resolved = path.resolve(file);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) throw new Error(`ファイルが見つかりません: ${resolved}`);
  return resolved;
}

/**
 * VS Code でファイル（line があればその行）を開く URL（vscode://file/<パス>:<行>）。パスは区切り（/）ごとに符号化する
 * （encodeURI は # と ? を符号化しないので、それを含むパスが URL の断片・問い合わせとして読まれ、開けなかった）
 */
export function vscodeFileUrl(target: string, line?: number): string {
  const position = typeof line === "number" && line > 0 ? `:${Math.floor(line)}` : "";
  return `vscode://file${target.split("/").map(encodeURIComponent).join("/")}${position}`;
}
