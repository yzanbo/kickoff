// P9-2f の道具: テストの call("METHOD", パス, 本文) を、取り決め（src/shared/*/contract.ts）の表で引き当てて api("METHOD /パス", { params, query, body }) に書き換える。
// 引き当たらない呼び出し（取り決めにない・パスを組み立てている・空のクエリ）は call のまま。使い方: node scripts/refactor/call-to-client.mjs [--exclude <json>] [--map <json>] <ファイル…>
// exclude は書き換えない呼び出し（{ file, at }。at は元のファイルの中の位置）、map は書き換えた呼び出しの新しい行の範囲を書き出す先
import fs from "node:fs";
import path from "node:path";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** 取り決めのルート（json の受け口だけ。form・blob・sse・ws・raw は call のまま） */
function loadRoutes() {
  const files = [...fs.readdirSync("src/shared").map((d) => `src/shared/${d}/contract.ts`), "src/shared/foundation/serverContract.ts"].filter((f) => fs.existsSync(f));
  const routes = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/"(GET|POST|PUT|PATCH|DELETE) (\/[^"]*)":\s*(\w+)/g)) {
      if (m[3] === "route" || m[3] === "empty") routes.push({ method: m[1], path: m[2], segs: m[2].split("/").slice(1) });
    }
  }
  return routes;
}

/** src[i] から始まる式の終わり（引数の区切りの , か閉じかっこ）までを読む */
function readArg(src, i) {
  const start = i;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") i = skipString(src, i);
    else if (c === "`") i = skipTemplate(src, i);
    else if (c === "(" || c === "[" || c === "{") (depth++, i++);
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--, i++;
    } else if (c === "," && depth === 0) break;
    else i++;
  }
  return { text: src.slice(start, i).trim(), end: i };
}
function skipString(src, i) {
  const q = src[i++];
  while (i < src.length && src[i] !== q) i += src[i] === "\\" ? 2 : 1;
  return i + 1;
}
function skipTemplate(src, i) {
  i++;
  while (i < src.length && src[i] !== "`") {
    if (src[i] === "\\") i += 2;
    else if (src[i] === "$" && src[i + 1] === "{") {
      const { end } = readArg(src, i + 2);
      i = end + 1;
    } else i++;
  }
  return i + 1;
}

/** パスの式を部品の列にする（文字 { lit } と式 { expr }）。文字列・テンプレート以外は null */
function piecesOf(text) {
  if (/^"[^"\\]*"$/.test(text)) return [{ lit: text.slice(1, -1) }];
  if (!text.startsWith("`") || !text.endsWith("`")) return null;
  const body = text.slice(1, -1);
  const out = [];
  let i = 0;
  let lit = "";
  while (i < body.length) {
    if (body[i] === "\\") return null;
    if (body[i] === "$" && body[i + 1] === "{") {
      const { text: expr, end } = readArg(body, i + 2);
      if (body[end] !== "}") return null;
      if (lit) out.push({ lit });
      lit = "";
      out.push({ expr });
      i = end + 1;
    } else lit += body[i++];
  }
  if (lit) out.push({ lit });
  return out;
}

/** 部品の列を区切り文字で分ける */
function splitPieces(pieces, sep) {
  const parts = [[]];
  for (const p of pieces) {
    if (p.expr !== undefined) parts.at(-1).push(p);
    else p.lit.split(sep).forEach((t, k) => (k > 0 && parts.push([]), t && parts.at(-1).push({ lit: t })));
  }
  return parts;
}

const unwrap = (expr) => expr.match(/^encodeURIComponent\(([^()]*(?:\([^()]*\))?[^()]*)\)$/)?.[1] ?? expr;
/** 1 つの部品だけの値のコード（文字は数字なら数、ほかは文字列） */
function valueOf(part, numeric) {
  if (part.length !== 1) return null;
  const [p] = part;
  if (p.expr !== undefined) return unwrap(p.expr);
  const t = decodeURIComponent(p.lit);
  return numeric && /^\d+$/.test(t) ? t : JSON.stringify(t);
}

function convert(method, pathText, routes) {
  const pieces = piecesOf(pathText);
  if (!pieces) return { skip: "パスを組み立てている" };
  // ? の前と後に分ける
  const at = pieces.findIndex((p) => p.lit?.includes("?"));
  let pathPieces = pieces;
  let queryPieces = [];
  if (at >= 0) {
    const [before, after] = [pieces[at].lit.slice(0, pieces[at].lit.indexOf("?")), pieces[at].lit.slice(pieces[at].lit.indexOf("?") + 1)];
    pathPieces = [...pieces.slice(0, at), ...(before ? [{ lit: before }] : [])];
    queryPieces = [...(after ? [{ lit: after }] : []), ...pieces.slice(at + 1)];
  }
  if (!pathPieces.length || pathPieces[0].lit === undefined || !pathPieces[0].lit.startsWith("/")) return { skip: "パスを組み立てている" };
  const segs = splitPieces(pathPieces, "/").slice(1);
  let best = null;
  let tie = false;
  for (const r of routes) {
    if (r.method !== method) continue;
    const params = [];
    let score = 0;
    let ok = true;
    for (let i = 0; i < r.segs.length && ok; i++) {
      const rs = r.segs[i];
      if (rs === "*") {
        const rest = segs.slice(i);
        if (!rest.length) ok = false;
        else {
          const joined = rest.flatMap((part, k) => (k ? [{ lit: "/" }, ...part] : part));
          const code = joined.every((p) => p.lit !== undefined) ? JSON.stringify(decodeURIComponent(joined.map((p) => p.lit).join(""))) : `\`${joined.map((p) => (p.lit !== undefined ? p.lit : `\${${unwrap(p.expr)}}`)).join("")}\``;
          params.push(`"*": ${code}`);
        }
        if (i !== r.segs.length - 1) ok = false;
        break;
      }
      const seg = segs[i];
      if (!seg) ok = false;
      else if (rs.startsWith(":")) {
        const v = valueOf(seg, true);
        if (v === null) ok = false;
        else params.push(`${rs.slice(1)}: ${v}`);
      } else if (seg.length === 1 && seg[0].lit === rs) score++;
      else ok = false;
    }
    if (ok && !r.segs.includes("*") && r.segs.length !== segs.length) ok = false;
    if (!ok) continue;
    if (!best || score > best.score) (best = { r, params, score }), (tie = false);
    else if (score === best.score) tie = true;
  }
  if (!best) return { skip: "取り決めにない" };
  if (tie) return { skip: "引き当てが 2 つ以上" };
  const query = [];
  for (const pair of splitPieces(queryPieces, "&")) {
    if (!pair.length) continue;
    const [first, ...rest] = pair;
    if (first.lit === undefined || !first.lit.includes("=")) return { skip: "クエリの形" };
    const [name, v0] = [first.lit.slice(0, first.lit.indexOf("=")), first.lit.slice(first.lit.indexOf("=") + 1)];
    const valueParts = [...(v0 ? [{ lit: v0 }] : []), ...rest];
    const v = valueOf(valueParts, false);
    if (v === null || v === '""') return { skip: "クエリの形" };
    query.push(`${/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)}: ${v}`);
  }
  return { key: `${method} ${best.r.path}`, params: best.params, query };
}

/** パスがその前に書いた const の文字（base・url など）で始まるなら、いちばん近い定義の文字に置き換える */
function inlineBase(src, at, text) {
  const head = text.match(/^`\$\{([A-Za-z_$][\w$]*)\}/) ?? text.match(/^([A-Za-z_$][\w$]*)$/);
  if (!head) return text;
  const defs = [...src.slice(0, at).matchAll(new RegExp(`\\bconst ${head[1].replace("$", "\\$")} = (\`[^\`\\n]*\`|"[^"\\n]*");`, "g"))];
  // 同じ test の中の定義か、いちばん外の定義だけ（間に行頭の } があれば、ほかの test の定義）
  const found = defs.reverse().find((d) => {
    const lineStart = src.lastIndexOf("\n", d.index) + 1;
    return d.index === lineStart || !/\n\}/.test(src.slice(d.index, at));
  });
  const def = found?.[1];
  if (!def) return text;
  const inner = def.startsWith('"') ? def.slice(1, -1) : def.slice(1, -1);
  return text.startsWith("`") ? `\`${inner}${text.slice(head[0].length)}` : `\`${inner}\``;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return null;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const excludeFile = opt("--exclude");
  const mapFile = opt("--map");
  const exclude = new Set(excludeFile && fs.existsSync(excludeFile) ? JSON.parse(fs.readFileSync(excludeFile, "utf8")).map((e) => `${e.file}:${e.at}`) : []);
  const routes = loadRoutes();
  const map = [];
  const skipped = {};
  let done = 0;
  for (const file of args) {
    const src = fs.readFileSync(file, "utf8");
    let out = "";
    let last = 0;
    let bare = false;
    for (const m of src.matchAll(/(\b[\w$]+\.)?\bcall\(\s*"(GET|POST|PUT|PATCH|DELETE)"\s*,\s*/g)) {
      if (m.index < last) continue;
      const pathArg = readArg(src, m.index + m[0].length);
      let end = pathArg.end;
      let body = null;
      if (src[end] === ",") {
        const b = readArg(src, end + 1);
        if (b.text) body = b.text;
        end = b.end;
        if (src[end] === ",") end = readArg(src, end + 1).end; // 末尾の ,
      }
      if (src[end] !== ")") continue;
      if (exclude.has(`${file}:${m.index}`)) continue;
      const res = convert(m[2], inlineBase(src, m.index, pathArg.text), routes);
      if (res.skip) {
        skipped[res.skip] = (skipped[res.skip] ?? 0) + 1;
        continue;
      }
      const input = [];
      if (res.params.length) input.push(`params: { ${res.params.join(", ")} }`);
      if (res.query.length) input.push(`query: { ${res.query.join(", ")} }`);
      if (body !== null && body !== "undefined") input.push(`body: ${body}`);
      const replacement = `${m[1] ?? ""}api("${res.key}"${input.length ? `, { ${input.join(", ")} }` : ""})`;
      if (!m[1]) bare = true;
      out += src.slice(last, m.index);
      const lineStart = out.split("\n").length;
      out += replacement;
      map.push({ file, at: m.index, from: lineStart, to: lineStart + replacement.split("\n").length - 1 });
      last = end + 1;
      done++;
    }
    out += src.slice(last);
    // 分割代入の call の隣に api を足す（使わなくなった call は型検査の知らせで外す）
    if (bare) out = out.replace(/(\{[^{}()]*?)\bcall\b(?![\s\S]{0,0}:)([^{}()]*\})/g, (all, a, b) => (/\bapi\b/.test(all) || /\bcall\s*:/.test(all) ? all : `${a}call, api${b}`));
    if (out !== src) fs.writeFileSync(file, out);
  }
  if (mapFile) fs.writeFileSync(mapFile, JSON.stringify(map));
  console.log(`書き換え ${done}・残した`, skipped);
}

main();
