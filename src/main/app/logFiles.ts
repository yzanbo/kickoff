import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { logsDir } from "./logs.js";

/**
 * ログの場所（logs.ts）の 1 つのファイルに書き足す口。この起動で初めて書くときに maxBytes を超えていれば、1 世代（.1）だけ残して新しく書き始める
 * （回すのはメインプロセスだけ）。書けなくてもアプリは止めない
 */
export function rotatingLog(name: string, maxBytes: number) {
  let file: string | undefined;
  const target = (): string => {
    if (!file) {
      const dir = logsDir();
      mkdirSync(dir, { recursive: true });
      file = path.join(dir, name);
      try {
        if (statSync(file).size > maxBytes) renameSync(file, `${file}.1`);
      } catch {
        // まだない
      }
    }
    return file;
  };
  const append = (text: string) => {
    try {
      appendFileSync(target(), text);
    } catch {
      // 記録が書けないだけなので無視する
    }
  };
  return {
    append,
    /** 1 行 1 件の JSON で書き足す */
    appendJson: (record: unknown) => append(`${JSON.stringify(record)}\n`),
  };
}
