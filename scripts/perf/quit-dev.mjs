// 開発版（npm run dev:cdp）を終える: 作業中のチャットがないことを /api/status で確かめてから、CDP の Browser.close で終わりを頼む
// （アプリのふつうの終わり方を通るので、書きかけの localStorage を失わない。AI の砂場の中からはメインプロセスにシグナルを送れないため）
// node scripts/perf/quit-dev.mjs [--cdp <port>] [--api <port>] [--data <保存先>]
import { api, connectBrowser, sleep } from "../devtools/cdp.mjs";

const status = await api("GET", "/api/status");
if (status.agents.running > 0) {
  console.error(`作業中のチャットが ${status.agents.running} つあるので終えません`);
  process.exit(1);
}
const browser = await connectBrowser();
// 答えを返す前に接続が切れることがある（終わり始めた）ので、失敗は見ない
await Promise.race([browser.send("Browser.close").catch(() => {}), sleep(1000)]);
browser.close();
console.log("開発版に終わりを頼みました");
