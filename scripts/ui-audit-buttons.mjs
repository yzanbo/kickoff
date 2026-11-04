// 開発版（KICKOFF_REMOTE_DEBUG=9333 npm run dev）の画面で、アイコンだけのボタンのアイコンがボタンの真ん中からずれているものを挙げる。
// ボタンの見た目を足した・変えたあとの確かめに使う（よくあるずれ: ブラウザの既定の余白（左右 6px）が残り、狭めたボタンでアイコンが右へはみ出す）。
//
//   node scripts/ui-audit-buttons.mjs [#/hash ...]   … 指定した画面（省けばいまの画面）を順に開いて調べる
//
// ずれたボタンがあれば、class・aria-label・大きさ・ずれ（px）・余白を出し、終わりのコードを 1 にする。本番のアプリ（ポート 4317）には触らない。
const CDP_PORT = Number(process.env.KICKOFF_REMOTE_DEBUG ?? 9333);
/** これ以上ずれていたら挙げる（px。小数の位置の丸めは数えない） */
const TOLERANCE = 0.75;

const AUDIT = `(() => {
  const out = [];
  for (const b of document.querySelectorAll("button, [role=button]")) {
    if (!b.offsetParent || b.textContent.trim()) continue;
    const svgs = b.querySelectorAll(":scope > svg");
    if (svgs.length !== 1) continue;
    const r = b.getBoundingClientRect(), i = svgs[0].getBoundingClientRect();
    if (r.width === 0 || r.width > 60) continue;
    const dx = i.x + i.width / 2 - (r.x + r.width / 2), dy = i.y + i.height / 2 - (r.y + r.height / 2);
    if (Math.abs(dx) >= ${TOLERANCE} || Math.abs(dy) >= ${TOLERANCE})
      out.push({ class: String(b.className), label: b.getAttribute("aria-label"), size: [Math.round(r.width), Math.round(r.height)], dx: +dx.toFixed(1), dy: +dy.toFixed(1), padding: getComputedStyle(b).padding });
  }
  return out;
})()`;

const pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = pages.find((p) => p.type === "page" && p.url.startsWith("http://localhost"));
if (!page) throw new Error(`開発版の画面が見つかりません（CDP ${CDP_PORT}）。KICKOFF_REMOTE_DEBUG=${CDP_PORT} npm run dev で起動してください`);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
let id = 0;
const evaluate = (expression) =>
  new Promise((resolve) => {
    const my = ++id;
    const onMessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id !== my) return;
      ws.removeEventListener("message", onMessage);
      resolve(d.result?.result?.value);
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id: my, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
  });

const hashes = process.argv.slice(2);
let found = 0;
for (const hash of hashes.length ? hashes : [null]) {
  if (hash) {
    await evaluate(`location.hash = ${JSON.stringify(hash)}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  const list = await evaluate(AUDIT);
  const where = hash ?? (await evaluate("location.hash")) ?? "";
  console.log(list.length ? `✗ ${where}: ${list.length} 件` : `✓ ${where}: ずれなし`);
  for (const item of list) console.log("  ", JSON.stringify(item));
  found += list.length;
}
ws.close();
process.exitCode = found ? 1 : 0;
