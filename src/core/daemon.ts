// Electron なしでコアだけを起動する（開発・動作確認用）
import os from "node:os";
import path from "node:path";
import { startCore } from "./index.js";
import { loadLoginShellPath } from "./shellEnv.js";

loadLoginShellPath();

const dataDir = process.env.KICKOFF_DATA_DIR ?? path.join(os.homedir(), "Library", "Application Support", "Kickoff");
const port = Number(process.env.KICKOFF_PORT ?? 4317);

const core = await startCore({ dataDir, port, host: process.env.KICKOFF_HOST });
console.log(`Kickoff core: ${core.localUrl}/pair?token=${core.token}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void core.close().then(() => process.exit(0)));
}
