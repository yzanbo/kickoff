// Electron なしでコアだけを起動する（開発・動作確認用。保存先とポートは開発用: appEnv.ts）
import path from "node:path";
import { macosPlatform } from "./platform/macos/index.js";
import { APP_ENVS, appDataDir } from "./system/appEnv.js";
import { seedDevData } from "./system/devData.js";
import { startCore } from "./index.js";

// macOS の音声認識の補助コマンドは、ビルド（npm run build・npm run dev）が out/native に作る
const platform = macosPlatform({ speechHelper: path.resolve("out/native/kickoff-speech") });
platform.loadLoginShellPath();

const dataDir = process.env.KICKOFF_DATA_DIR ?? appDataDir("development");
const port = Number(process.env.KICKOFF_PORT ?? APP_ENVS.development.port);
// 開発のデータがまだなければ、本番のデータから一度だけ写す
if (!process.env.KICKOFF_DATA_DIR) seedDevData(appDataDir("production"), dataDir);

const core = await startCore({ dataDir, port, host: process.env.KICKOFF_HOST, platform });
console.log(`Kickoff core: ${core.localUrl}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void core.close().then(() => process.exit(0)));
}
