// Electron なしでコアだけを起動する（開発・動作確認用。保存先とポートは開発用: appEnv.ts）
import path from "node:path";
import { macosPlatform } from "./platform/macos/index.js";
import { APP_ENVS, appDataDir } from "./system/appEnv.js";
import { seedDevData } from "./system/devData.js";
import { startCore } from "./index.js";

// macOS の音声認識の補助コマンドは、ビルド（npm run build・npm run dev）が out/native に作る
const platform = macosPlatform({ speechHelper: path.resolve("out/native/kickoff-speech") });
platform.loadLoginShellPath();

const dataDir = process.env.KICKOFF_DATA_DIR ?? appDataDir(platform.appDataRoot, "development");
const port = Number(process.env.KICKOFF_PORT ?? APP_ENVS.development.port);
// 開発のデータがまだなければ、本番のデータから一度だけ写す
if (!process.env.KICKOFF_DATA_DIR) seedDevData(appDataDir(platform.appDataRoot, "production"), dataDir);

const core = await startCore({ dataDir, port, host: process.env.KICKOFF_HOST, platform });
// ブラウザで開くときは、一度だけ使えるログインの URL（5 分）から入る（本体のトークンを URL に入れない）
console.log(`Kickoff core: ${core.localUrl}\nブラウザで開く（一度だけ・5 分）: ${core.browserLoginUrl()}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void core.close().then(() => process.exit(0)));
}
