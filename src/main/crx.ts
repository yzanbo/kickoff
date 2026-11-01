import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** .crx のヘッダーの後ろから始まる zip 部分の位置（CRX2 / CRX3 に対応） */
export function crxZipOffset(crx: Buffer): number {
  if (crx.subarray(0, 4).toString() !== "Cr24") throw new Error("拡張機能のファイル形式が正しくありません");
  const version = crx.readUInt32LE(4);
  if (version === 3) return 12 + crx.readUInt32LE(8);
  if (version === 2) return 16 + crx.readUInt32LE(8) + crx.readUInt32LE(12);
  throw new Error(`未対応の拡張機能のファイル形式です（CRX${version}）`);
}

/**
 * .crx（Chrome 拡張のパッケージ）を展開する。中身は「独自のヘッダー＋zip」なので、
 * ヘッダーを読み飛ばして zip 部分を unzip で展開する。
 */
export async function unpackCrx(crx: Buffer, target: string) {
  const zipStart = crxZipOffset(crx);
  const tmp = path.join(os.tmpdir(), `kickoff-ext-${Date.now()}.zip`);
  await fs.writeFile(tmp, crx.subarray(zipStart));
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  try {
    await execFileAsync("unzip", ["-q", "-o", tmp, "-d", target]).catch((e: { code?: number }) => {
      // 終了コード 1 は警告のみ（ヘッダーの余りなど）で、展開はできている
      if (e.code !== 1) throw e;
    });
  } finally {
    await fs.rm(tmp, { force: true });
  }
  await fs.rm(path.join(target, "_metadata"), { recursive: true, force: true });
}
