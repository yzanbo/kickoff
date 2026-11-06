import fs from "node:fs/promises";
import path from "node:path";
import { MAX_TOOL_IMAGE_BYTES, toolImageType } from "@shared/chat/toolImage";
import { Invalid, NotFound } from "../http/errors.js";
import { isInside, realPathLoose } from "../system/paths.js";

/** 読んだ画像の中身（画面に出す） */
export interface ToolImage {
  data: Buffer;
  type: string;
  /** ファイルを最後に変えた時刻（ミリ秒） */
  mtimeMs: number;
}

/**
 * ツールの結果の画像（読むで読んだ画像）を、呼び出しの入力のパスから読む。記録には画像を残さないので、いまのファイルを返す。
 * 読めるのは roots（チャットの作業場所・本体・添付の保存先・メモのフォルダ）の中の画像だけ（リンクを解決してから確かめる。
 * どこでも読めると、API から任意のファイルを取れてしまうため）。外・画像でない・大きすぎるは 400、ないは 404
 */
export async function readToolImage(file: string, roots: string[]): Promise<ToolImage> {
  if (!path.isAbsolute(file)) throw new Invalid("パスは絶対パスで指定してください");
  const type = toolImageType(file);
  if (!type) throw new Invalid("画像のファイルではありません");
  const real = realPathLoose(file);
  if (!roots.some((root) => isInside(realPathLoose(root), real))) {
    throw new Invalid("作業場所・添付・メモのフォルダの外のファイルは表示しません");
  }
  const stat = await fs.stat(real).catch(() => null);
  if (!stat) throw new NotFound("ファイルがありません");
  if (!stat.isFile()) throw new Invalid("ファイルではありません");
  if (stat.size > MAX_TOOL_IMAGE_BYTES) throw new Invalid(`画像が大きすぎます（上限 ${MAX_TOOL_IMAGE_BYTES / 1024 / 1024} MB）`);
  return { data: await fs.readFile(real), type, mtimeMs: Math.floor(stat.mtimeMs) };
}
