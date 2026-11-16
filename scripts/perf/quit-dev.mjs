// 開発版（npm run dev:cdp）を終える: 作業中のチャットがないことを /api/status で確かめてから、CDP の Browser.close で終わりを頼む
// （アプリのふつうの終わり方を通るので、書きかけの localStorage を失わない。AI の砂場の中からはメインプロセスにシグナルを送れないため）
// node scripts/perf/quit-dev.mjs
import { api, CDP_PORT } from "./cdp.mjs";

const status = await api("GET", "/api/status");
if (status.agents.running > 0) {
  console.error(`作業中のチャットが ${status.agents.running} つあるので終えません`);
  process.exit(1);
}
const version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
await new Promise((resolve) => setTimeout(resolve, 1000));
ws.close();
console.log("開発版に終わりを頼みました");
