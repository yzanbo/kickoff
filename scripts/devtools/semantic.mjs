// 画面の意味の記録: 画面に出る物（役割・名前・data-*・見えるか・押せるか・選ばれているか）を文書の順に並べたもの。
// スタイルつきの記録（ui-snapshot の take）と違い、CSS を書き換えても変わらず、部品を作り直したときに物・文言・並びが変わったかを見る。
// ui-snapshot.mjs の take --semantic と snap-all.mjs が使う

/** 記録する data-*（dataset の名前） */
const DATA_KEYS = ["chatId", "projectId", "kind", "state"];

/** 選ばれているかを表す属性 */
const STATE_ATTRS = ["aria-selected", "aria-current", "aria-pressed", "aria-expanded", "aria-checked"];

/**
 * 毎回変わる中身の所（使用枠の割合・残り時間など、決まったデータの外の値を出す所）。物は残し、名前と中身は記録しない。
 * 揺れる所を見つけたら、ここに足す
 */
const VOLATILE = [".footer-usage", ".usage-service"];

/** 画面の中で動かす: 意味の記録を JSON の文字で返す */
export const SEMANTIC_JS = `(() => {
  const DATA_KEYS = ${JSON.stringify(DATA_KEYS)};
  const STATE_ATTRS = ${JSON.stringify(STATE_ATTRS)};
  const VOLATILE = ${JSON.stringify(VOLATILE.join(","))};
  const TAG_ROLES = { a: "link", button: "button", select: "combobox", textarea: "textbox", h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading", ul: "list", ol: "list", li: "listitem", nav: "navigation", main: "main", aside: "complementary", header: "banner", footer: "contentinfo", dialog: "dialog", img: "img", svg: "img", table: "table", tr: "row", td: "cell", th: "columnheader", summary: "button", details: "group", p: "paragraph", hr: "separator", option: "option", progress: "progressbar" };
  const INPUT_ROLES = { checkbox: "checkbox", radio: "radio", range: "slider", button: "button", submit: "button", search: "searchbox", number: "spinbutton" };
  const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "LINK", "META"]);
  const clip = (s) => (s ?? "").replace(/\\s+/g, " ").trim().slice(0, 60);
  const roleOf = (el, tag) => el.getAttribute("role") || (tag === "input" ? INPUT_ROLES[el.type] ?? "textbox" : TAG_ROLES[tag] ?? (tag === "div" || tag === "span" ? "" : tag));
  // 名前: aria-label > title > 入力欄の placeholder > 要素がじかに持つ文字（svg のアイコンは lucide の名前）
  const nameOf = (el, tag) => {
    const own = tag === "svg" ? [...el.classList].find((c) => c.startsWith("lucide-")) : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ");
    return clip(el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || own);
  };
  const items = [];
  const walk = (el, depth) => {
    for (const child of el.children) {
      if (SKIP.has(child.tagName)) continue;
      const tag = child.tagName.toLowerCase();
      const volatile = child.matches(VOLATILE);
      const role = roleOf(child, tag);
      const name = volatile ? "" : nameOf(child, tag);
      const data = {};
      for (const k of DATA_KEYS) if (child.dataset?.[k] !== undefined) data[k] = child.dataset[k];
      const hasData = Object.keys(data).length > 0;
      // 包むだけの div・span（役割も名前も data-* もない）は飛ばし、中だけを同じ深さで見る
      if (!role && !name && !hasData && !volatile) {
        walk(child, depth);
        continue;
      }
      const item = { role: role || (volatile ? "volatile" : "text"), name, depth };
      if (hasData) item.data = data;
      const visible = child.checkVisibility();
      item.visible = visible;
      if (child.disabled === true || child.getAttribute("aria-disabled") === "true") item.disabled = true;
      const state = STATE_ATTRS.filter((a) => child.hasAttribute(a)).map((a) => a.slice(5) + "=" + child.getAttribute(a));
      if (state.length) item.state = state;
      items.push(item);
      // 見えない物の中・アイコンの中・揺れる所の中は記録しない
      if (visible && tag !== "svg" && !volatile) walk(child, depth + 1);
    }
  };
  walk(document.body, 0);
  return JSON.stringify({ hash: location.hash, theme: document.documentElement.dataset.theme ?? "", size: [innerWidth, innerHeight], count: items.length, items });
})()`;

/** 記録を 1 物 1 行の JSON にする（差分を行で読めるように） */
export function formatSemantic(record) {
  const { items, ...head } = record;
  return `${JSON.stringify(head).slice(0, -1)},"items":[\n${items.map((item) => JSON.stringify(item)).join(",\n")}\n]}\n`;
}

/** 並びを比べるときの物の名札（役割・名前・深さ・data-*。見えるか・押せるか・選ばれているかは含めない） */
const keyOf = (item) => `${item.depth}|${item.role}|${item.name}|${JSON.stringify(item.data ?? {})}`;
/** 物の全部の中身 */
const fullOf = (item) => `${keyOf(item)}|${item.visible}|${item.disabled ?? ""}|${(item.state ?? []).join(",")}`;

/** 名札の並びの最長共通部分（組になる位置の対 [i, j] を前から順に） */
function commonPairs(a, b) {
  const n = a.length;
  const m = b.length;
  // 後ろから数えた最長の長さ（(n + 1) × (m + 1)）
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] = a[i] === b[j] ? table[at(i + 1, j + 1)] + 1 : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) i++;
    else j++;
  }
  return pairs;
}

/**
 * 2 つの意味の記録の並びを比べる（純粋）: 名札の最長共通部分で組にし、組になった物のうち中身（見えるか・押せるか・選ばれているか）の違う物を「変わった」、
 * 組にならなかった物のうち、同じ隙間で同じ役割・深さの物どうしを順に「変わった」（名前などが変わった）、残りを「前だけ」「後だけ」にする。
 * 番号は items の位置
 */
export function diffSemantic(a, b) {
  const ka = a.items.map(keyOf);
  const kb = b.items.map(keyOf);
  // 頭と尻の同じ所を除いてから最長共通部分を取る（ほとんど同じ記録を速く比べる）
  let head = 0;
  while (head < ka.length && head < kb.length && ka[head] === kb[head]) head++;
  let tail = 0;
  while (tail < ka.length - head && tail < kb.length - head && ka[ka.length - 1 - tail] === kb[kb.length - 1 - tail]) tail++;
  const middle = commonPairs(ka.slice(head, ka.length - tail), kb.slice(head, kb.length - tail)).map(([i, j]) => [i + head, j + head]);
  const pairs = [...Array.from({ length: head }, (_, i) => [i, i]), ...middle, ...Array.from({ length: tail }, (_, k) => [ka.length - tail + k, kb.length - tail + k])];
  const onlyA = [];
  const onlyB = [];
  const changed = [];
  let pi = 0;
  let pj = 0;
  // 組の間（隙間）ごとに、組にならなかった物を分ける。最後の隙間のために番兵の組を足す
  for (const [i, j] of [...pairs, [ka.length, kb.length]]) {
    const gapA = Array.from({ length: i - pi }, (_, k) => pi + k);
    const gapB = Array.from({ length: j - pj }, (_, k) => pj + k);
    while (gapA.length && gapB.length && a.items[gapA[0]].role === b.items[gapB[0]].role && a.items[gapA[0]].depth === b.items[gapB[0]].depth) {
      changed.push({ a: gapA.shift(), b: gapB.shift() });
    }
    onlyA.push(...gapA);
    onlyB.push(...gapB);
    if (i < ka.length && fullOf(a.items[i]) !== fullOf(b.items[j])) changed.push({ a: i, b: j });
    pi = i + 1;
    pj = j + 1;
  }
  changed.sort((x, y) => x.a - y.a);
  return { onlyA, onlyB, changed, same: onlyA.length === 0 && onlyB.length === 0 && changed.length === 0 };
}

/** 物を 1 行の文にする */
const describe = (item) =>
  `${"  ".repeat(Math.min(item.depth, 12))}${item.role}${item.name ? ` "${item.name}"` : ""}${item.data ? ` ${JSON.stringify(item.data)}` : ""}${item.visible ? "" : " (見えない)"}${item.disabled ? " (押せない)" : ""}${item.state ? ` [${item.state.join(" ")}]` : ""}`;

/** diffSemantic の結果を、人が読む行にする（limit 行まで） */
export function formatSemanticDiff(a, b, result, limit = 40) {
  const lines = [`前: ${a.count} 物 (${a.hash}, ${a.theme || "dark"}) / 後: ${b.count} 物 (${b.hash}, ${b.theme || "dark"})`, `前だけ ${result.onlyA.length} / 後だけ ${result.onlyB.length} / 変わった ${result.changed.length}`];
  const body = [
    ...result.onlyA.map((i) => ({ at: i, text: `- ${describe(a.items[i])}` })),
    ...result.onlyB.map((j) => ({ at: j, text: `+ ${describe(b.items[j])}` })),
    ...result.changed.map(({ a: i, b: j }) => ({ at: i, text: `~ ${describe(a.items[i])}\n  → ${describe(b.items[j]).trimStart()}` })),
  ].sort((x, y) => x.at - y.at);
  for (const { text } of body.slice(0, limit)) lines.push(text);
  if (body.length > limit) lines.push(`…ほか ${body.length - limit} 件`);
  return lines.join("\n");
}
