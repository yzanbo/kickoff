import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** 外部のコマンドを実行して標準出力・標準エラーを返す（Promise 版の execFile。各所で promisify し直さない） */
export const execFileAsync = promisify(execFile);
