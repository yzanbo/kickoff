// AI の SQL の結果を書き出す CSV の置き場所と片付け。OS の一時フォルダの <保存先の名前>-db/<チャット>/ に置き（Kickoff の保存先は
// AI が読めないので、その外に置く）、7 日たったもの・消したチャットのものを消す
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

/** 書き出した CSV を残す日数 */
export const AI_EXPORT_KEEP_MS = 7 * 24 * 60 * 60_000;

/** 置き場所（製品版と開発版で分ける。保存先のフォルダの名前を小文字にして空白を - にしたもの ＋ -db） */
export function aiExportRoot(dataDir: string, tmpDir = os.tmpdir()): string {
  const name = path.basename(dataDir).toLowerCase().replace(/\s+/g, "-") || "kickoff";
  return path.join(tmpDir, `${name}-db`);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 書き出すファイル（チャットごとのフォルダに、日時・接続の名前・重ならない印） */
export function aiExportFile(root: string, chatId: number, connectionName: string, now = new Date()): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const name = connectionName.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "db";
  return path.join(root, String(chatId), `${stamp}-${name}-${randomBytes(3).toString("hex")}.csv`);
}

/** チャットの CSV をすべて消す（チャットを消したとき） */
export function removeChatExports(root: string, chatId: number) {
  fs.rmSync(path.join(root, String(chatId)), { recursive: true, force: true });
}

/** 古い CSV（maxAge を過ぎたもの）と、もうないチャットのフォルダ・空になったフォルダを消す */
export function cleanAiExports(root: string, chatExists: (chatId: number) => boolean, now = Date.now(), maxAge = AI_EXPORT_KEEP_MS) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const dir = path.join(root, entry.name);
    const chatId = Number(entry.name);
    if (!entry.isDirectory() || !Number.isInteger(chatId) || !chatExists(chatId)) {
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full, { throwIfNoEntry: false });
      if (stat && now - stat.mtimeMs > maxAge) fs.rmSync(full, { recursive: true, force: true });
    }
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
}
