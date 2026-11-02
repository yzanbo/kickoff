// 開発版（KICKOFF_REMOTE_DEBUG=9333 npm run dev）の画面の DOM と計算後のスタイルを記録し、変更の前後で比べる。
// 見た目を変えないはずの変更（CSS の分割・部品の分割）の確かめに使う。
//
//   node scripts/ui-snapshot.mjs take <名前> [#/hash] [--pre "<先に画面で実行する JS>"] [--wait ms]
//   node scripts/ui-snapshot.mjs diff <前の名前> <後の名前> [--ignore prop1,prop2] [--limit 60]
//   node scripts/ui-snapshot.mjs css <名前>           … 読み込まれている CSS の規則を順に記録する（分割の前後で順が同じかを見る）
//   node scripts/ui-snapshot.mjs state save <名前>    … いまの localStorage を保存する（前後で同じ状態から始めるため）
//   node scripts/ui-snapshot.mjs state restore <名前> … 保存した localStorage に戻して画面を読み直す（確かめ終わったら利用者の状態に戻すのにも使う）
//
// 記録は /tmp/kickoff-snaps/<名前>.json（状態は state-<名前>.json）。本番のアプリ（ポート 4317）には触らない。
import fs from "node:fs";
import path from "node:path";

const DIR = "/tmp/kickoff-snaps";
const CDP_PORT = Number(process.env.KICKOFF_REMOTE_DEBUG ?? 9333);

/** 見た目に関わる計算後のプロパティ（全部は多すぎるので、レイアウト・色・文字・枠・重なりに絞る） */
const PROPS = [
  "display", "position", "top", "right", "bottom", "left", "inset", "z-index", "float", "clear",
  "width", "height", "min-width", "min-height", "max-width", "max-height", "box-sizing",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "order",
  "align-items", "align-self", "align-content", "justify-content", "justify-items", "justify-self",
  "gap", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows", "grid-auto-flow", "grid-column", "grid-row", "grid-area",
  "overflow-x", "overflow-y", "visibility", "opacity", "transform", "transform-origin", "clip-path", "contain", "container-type", "container-name",
  "color", "background-color", "background-image", "background-size", "background-position", "background-repeat", "background-clip",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
  "outline-width", "outline-style", "outline-color", "outline-offset", "box-shadow", "filter", "backdrop-filter", "mix-blend-mode",
  "font-family", "font-size", "font-weight", "font-style", "font-variant-numeric", "line-height", "letter-spacing", "word-spacing",
  "text-align", "text-decoration-line", "text-decoration-color", "text-decoration-style", "text-transform", "text-overflow", "text-shadow", "text-indent",
  "white-space", "word-break", "overflow-wrap", "vertical-align", "direction", "tab-size", "-webkit-line-clamp", "-webkit-box-orient",
  "cursor", "pointer-events", "user-select", "-webkit-app-region", "-webkit-user-drag", "resize", "appearance", "scrollbar-width", "scrollbar-gutter",
  "transition-property", "transition-duration", "transition-timing-function", "transition-delay",
  "animation-name", "animation-duration", "animation-timing-function", "animation-iteration-count", "animation-direction", "animation-fill-mode",
  "list-style-type", "object-fit", "object-position", "aspect-ratio", "caret-color", "accent-color", "color-scheme", "content", "fill", "stroke", "stroke-width",
];

/** 画面の中で動かす: すべての要素の計算後のスタイル・疑似要素・位置を集める（アニメーションは 0 秒で止め、ピントを外して、状態をそろえる） */
const SNAPSHOT_JS = `(() => {
  const PROPS = ${JSON.stringify(PROPS)};
  document.activeElement?.blur?.();
  document.getAnimations().forEach((a) => { try { a.pause(); a.currentTime = 0; } catch {} });
  const sig = (el) => el.tagName.toLowerCase() + [...el.classList].sort().map((c) => "." + c).join("");
  const read = (cs) => { const o = {}; for (const p of PROPS) o[p] = cs.getPropertyValue(p); return o; };
  const out = [];
  const walk = (el, prefix) => {
    const counts = new Map();
    for (const child of el.children) {
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
      const s = sig(child);
      const n = counts.get(s) ?? 0;
      counts.set(s, n + 1);
      const p = (prefix ? prefix + ">" : "") + s + (n ? ":" + n : "");
      const pseudo = {};
      for (const ps of ["::before", "::after"]) {
        const pcs = getComputedStyle(child, ps);
        if (pcs.content && pcs.content !== "none" && pcs.content !== "normal") pseudo[ps] = read(pcs);
      }
      const r = child.getBoundingClientRect();
      out.push({
        path: p,
        styles: read(getComputedStyle(child)),
        pseudo,
        rect: [r.x, r.y, r.width, r.height].map(Math.round),
        text: child.children.length === 0 ? (child.textContent ?? "").trim().slice(0, 30) : "",
      });
      walk(child, p);
    }
  };
  walk(document.body, "");
  return JSON.stringify({ hash: location.hash, theme: document.documentElement.dataset.theme ?? "", size: [innerWidth, innerHeight], count: out.length, elements: out });
})()`;

/** 読み込まれているスタイルシートごとに、規則を順に並べる（コメントは入らないので、分割の前後で同じになるはず） */
const CSS_RULES_JS = `JSON.stringify([...document.styleSheets].map((s) => {
  let rules = [];
  try { rules = [...s.cssRules].map((r) => r.cssText); } catch { rules = ["<読めない>"]; }
  return { id: s.ownerNode?.getAttribute?.("data-vite-dev-id") ?? s.href ?? "<inline>", rules };
}))`;

/** 開発版の画面（CDP）につなぐ。webview（埋め込みブラウザ）や DevTools ではなく、アプリの画面を選ぶ */
async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const pages = targets.filter((t) => t.type === "page" && !t.url.startsWith("devtools://"));
  const page = pages.find((t) => /localhost:5173|index\.html/.test(t.url)) ?? pages[0];
  if (!page) throw new Error(`画面が見つかりません（KICKOFF_REMOTE_DEBUG=${CDP_PORT} npm run dev で起動していますか）`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, ng) => {
    ws.onopen = ok;
    ws.onerror = ng;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const evaluate = async (expression) => {
    const r = await new Promise((ok) => {
      const id = ++seq;
      pending.set(id, ok);
      ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (r.error) throw new Error(r.error.message);
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  return { evaluate, close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const file = (name) => path.join(DIR, `${name}.json`);
const option = (args, key, fallback) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : fallback;
};
const short = (p) => p.split(">").slice(-3).join(">");

async function take(args) {
  const name = args.shift();
  const hash = args[0] && !args[0].startsWith("--") ? args.shift() : undefined;
  if (!name) throw new Error("名前を指定してください");
  const pre = option(args, "--pre");
  const wait = Number(option(args, "--wait", "1500"));
  const cdp = await connect();
  try {
    if (hash !== undefined) {
      await cdp.evaluate(`location.hash = ${JSON.stringify(hash)}`);
      await sleep(wait);
    }
    if (pre) {
      await cdp.evaluate(`(async () => { ${pre} })()`);
      await sleep(wait);
    }
    const json = await cdp.evaluate(SNAPSHOT_JS);
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file(name), json);
    const meta = JSON.parse(json);
    console.log(`${name}: ${meta.count} 要素, hash=${meta.hash}, theme=${meta.theme || "dark"}, size=${meta.size.join("x")} → ${file(name)}`);
  } finally {
    cdp.close();
  }
}

async function css(args) {
  const name = args.shift();
  if (!name) throw new Error("名前を指定してください");
  const cdp = await connect();
  try {
    const json = await cdp.evaluate(CSS_RULES_JS);
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file(name), json);
    for (const s of JSON.parse(json)) console.log(`${s.rules.length} 規則: ${s.id}`);
  } finally {
    cdp.close();
  }
}

/** localStorage の保存と復元（復元は sessionStorage も消し、#/ に戻して読み直す） */
async function state(args) {
  const [action, name] = args;
  if (!name || (action !== "save" && action !== "restore")) throw new Error("state save <名前> か state restore <名前>");
  const cdp = await connect();
  try {
    if (action === "save") {
      const json = await cdp.evaluate("JSON.stringify({ hash: location.hash, ls: Object.fromEntries(Object.entries(localStorage)) })");
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(file(`state-${name}`), json);
      console.log(`${Object.keys(JSON.parse(json).ls).length} 件のキーを保存 → ${file(`state-${name}`)}`);
    } else {
      const saved = JSON.parse(fs.readFileSync(file(`state-${name}`), "utf8"));
      await cdp.evaluate(`localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(saved.ls)})) localStorage.setItem(k, v); sessionStorage.clear(); location.hash = "#/"; location.reload();`);
      await sleep(3500);
      console.log(`${Object.keys(saved.ls).length} 件のキーに戻して読み直しました`);
    }
  } finally {
    cdp.close();
  }
}

/** スタイルの違い・DOM の違いを出す。違いがあれば終了コード 1 */
function diff(args) {
  const [a, b] = args;
  if (!a || !b) throw new Error("前と後の名前を指定してください");
  const ignore = new Set(String(option(args, "--ignore", "")).split(",").filter(Boolean));
  const limit = Number(option(args, "--limit", "60"));
  const A = JSON.parse(fs.readFileSync(file(a), "utf8"));
  const B = JSON.parse(fs.readFileSync(file(b), "utf8"));
  if (Array.isArray(A)) return diffCss(A, B);
  const mapA = new Map(A.elements.map((e) => [e.path, e]));
  const mapB = new Map(B.elements.map((e) => [e.path, e]));
  const onlyA = [...mapA.keys()].filter((k) => !mapB.has(k));
  const onlyB = [...mapB.keys()].filter((k) => !mapA.has(k));
  let styleDiffs = 0;
  let rectDiffs = 0;
  const lines = [];
  const rectLines = [];
  for (const [p, ea] of mapA) {
    const eb = mapB.get(p);
    if (!eb) continue;
    const diffs = [];
    for (const k of Object.keys(ea.styles)) if (!ignore.has(k) && ea.styles[k] !== eb.styles[k]) diffs.push(`${k}: ${ea.styles[k]} → ${eb.styles[k]}`);
    for (const ps of new Set([...Object.keys(ea.pseudo), ...Object.keys(eb.pseudo)])) {
      const pa = ea.pseudo[ps];
      const pb = eb.pseudo[ps];
      if (!pa || !pb) {
        diffs.push(`${ps}: ${pa ? "あり" : "なし"} → ${pb ? "あり" : "なし"}`);
        continue;
      }
      for (const k of Object.keys(pa)) if (!ignore.has(k) && pa[k] !== pb[k]) diffs.push(`${ps} ${k}: ${pa[k]} → ${pb[k]}`);
    }
    if (diffs.length) {
      styleDiffs += diffs.length;
      lines.push(`■ ${short(p)} ${ea.text ? JSON.stringify(ea.text) : ""}`);
      for (const d of diffs.slice(0, 8)) lines.push(`   ${d}`);
      if (diffs.length > 8) lines.push(`   …ほか ${diffs.length - 8} 件`);
    }
    if (ea.rect.join() !== eb.rect.join()) {
      rectDiffs++;
      if (rectLines.length < 12) rectLines.push(`   ${short(p)} ${ea.rect.join(",")} → ${eb.rect.join(",")} ${ea.text ? JSON.stringify(ea.text) : ""}`);
    }
  }
  console.log(`前: ${A.count} 要素 (${A.hash}, ${A.theme || "dark"}, ${A.size.join("x")}) / 後: ${B.count} 要素 (${B.hash}, ${B.theme || "dark"}, ${B.size.join("x")})`);
  if (A.size.join() !== B.size.join()) console.log("※ ウィンドウの大きさが違うので、位置・大きさの違いは参考にならない");
  console.log(`DOM: 前だけ ${onlyA.length} / 後だけ ${onlyB.length}。スタイルの違い ${styleDiffs} 件、位置・大きさの違い ${rectDiffs} 要素`);
  const list = (title, items) => items.length && console.log(`${title}\n` + items.slice(0, 15).map((p) => "   " + short(p)).join("\n") + (items.length > 15 ? `\n   …ほか ${items.length - 15}` : ""));
  list("前だけにある:", onlyA);
  list("後だけにある:", onlyB);
  if (lines.length) console.log(lines.slice(0, limit).join("\n") + (lines.length > limit ? `\n…ほか ${lines.length - limit} 行` : ""));
  if (rectLines.length) console.log("位置・大きさの違い（先頭）:\n" + rectLines.join("\n"));
  process.exitCode = styleDiffs || onlyA.length || onlyB.length ? 1 : 0;
}

/** CSS の規則の記録どうしを、順に並べたまま比べる（どのシートに属するかは見ない） */
function diffCss(A, B) {
  const flat = (sheets) => sheets.filter((s) => !/xterm|monaco|codicon/.test(s.id)).flatMap((s) => s.rules);
  const ra = flat(A);
  const rb = flat(B);
  let first = -1;
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    if (ra[i] !== rb[i]) {
      first = i;
      break;
    }
  }
  console.log(`規則: 前 ${ra.length} / 後 ${rb.length}。${first < 0 ? "順も中身も同じ" : `${first + 1} 番目から違う`}`);
  if (first >= 0) console.log(`   前: ${ra[first]?.slice(0, 200)}\n   後: ${rb[first]?.slice(0, 200)}`);
  process.exitCode = first < 0 ? 0 : 1;
}

const [command, ...rest] = process.argv.slice(2);
const commands = { take, diff, css, state };
if (!commands[command]) {
  console.error("使い方: node scripts/ui-snapshot.mjs take <名前> [#/hash] | diff <前> <後> | css <名前> | state save|restore <名前>");
  process.exit(2);
}
await commands[command](rest);
