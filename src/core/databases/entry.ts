// 単体のコア（npm run daemon）・テストで使う DB ワーカーの入口（ソースの worker/main.ts を node ＋ tsx で動かす）。
// Electron のアプリは、ビルドが作る out/main/dbWorker.js を startCore({ dbWorker }) で渡す
import { fileURLToPath } from "node:url";
import type { WorkerEntry } from "./client.js";

export function devWorkerEntry(): WorkerEntry {
  return { file: fileURLToPath(new URL("./worker/main.ts", import.meta.url)), execArgv: ["--import", "tsx", "--disable-warning=ExperimentalWarning"], electron: false };
}
