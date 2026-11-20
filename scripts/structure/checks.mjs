// 構造の検査（scripts/check-structure.mjs）の種類のうち、import のグラフ・行の数・ファイルの置き場所で見るもの。
// どれも違反 { kind, key, message, value? } の並びを返す。key は基準線に載る文字
import { expandLayers, matchesAny } from "./parse.mjs";

/** テストとして扱うファイルを、決まりの tests（既定 include）に合わせて外すか */
export function skipsTest(file, rule, config, fallback = "include") {
  return (rule.tests ?? fallback) === "exclude" && matchesAny(file, config.tests ?? []);
}

/** import の向き: 決まりごとに、from に合うファイルの行き先が allow / deny・allowModules / denyModules に合うか */
export function checkImports(graph, config) {
  const layers = config.layers ?? {};
  const out = [];
  for (const rule of config.imports ?? []) {
    const from = expandLayers(rule.from, layers);
    const allow = rule.allow && expandLayers(rule.allow, layers);
    const deny = rule.deny && expandLayers(rule.deny, layers);
    const except = expandLayers(rule.except ?? [], layers);
    for (const [file, edges] of graph) {
      if (!matchesAny(file, from) || matchesAny(file, except) || skipsTest(file, rule, config)) continue;
      for (const edge of edges) {
        if ((edge.typeOnly && rule.typeOnlyAllowed) || (edge.dynamic && rule.dynamicAllowed)) continue;
        const bad = edge.path
          ? (allow && !matchesAny(edge.path, allow)) || (deny && matchesAny(edge.path, deny))
          : (rule.allowModules && !matchesAny(edge.module, rule.allowModules)) || (rule.denyModules && matchesAny(edge.module, rule.denyModules));
        // pureLocal: 読んでよいリポジトリの中のファイルも、パッケージは allowModules のものだけを読む（React を読む補助を通して読まない）
        const impure = !bad && rule.pureLocal && edge.path && (graph.get(edge.path) ?? []).some((e) => e.module && !matchesAny(e.module, rule.allowModules ?? []));
        if (bad || impure) out.push({ kind: "import", key: `import:${rule.name}:${file} -> ${edge.path ?? edge.module}`, message: `${file}: ${rule.message}` });
      }
    }
  }
  return out;
}

/** ファイルの大きさ: 行の数が上限（rules の上から最初に合ったもの。なければ limit）を超えるか。値は行の数 */
export function checkFileSizes(lineCounts, config) {
  const { limit, rules = [], files = [] } = config.fileSize ?? {};
  const out = [];
  for (const [file, lines] of lineCounts) {
    if (!matchesAny(file, files)) continue;
    const max = rules.find((rule) => matchesAny(file, [rule.glob]))?.limit ?? limit;
    if (lines > max) out.push({ kind: "size", key: `size:${file}`, value: lines, message: `${file}: ${lines} 行（上限 ${max} 行。分ける）` });
  }
  return out;
}

/** ファイルの祖先のフォルダ（外側から） */
function ancestors(file) {
  const parts = file.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** 公開の口: dirs に合うフォルダの中のファイルを、そのフォルダの外から読むとき、行き先が entry か */
export function checkPublicApi(graph, config) {
  const out = [];
  for (const rule of config.publicApi ?? []) {
    const dirs = [rule.dirs].flat();
    for (const [file, edges] of graph) {
      if (rule.except && matchesAny(file, rule.except)) continue;
      for (const edge of edges) {
        if (!edge.path) continue;
        const dir = ancestors(edge.path).find((d) => matchesAny(d, dirs));
        if (!dir || file.startsWith(`${dir}/`) || matchesAny(edge.path.slice(dir.length + 1), rule.entry)) continue;
        out.push({ kind: "public", key: `public:${rule.name}:${file} -> ${edge.path}`, message: `${file}: ${dir} の中は ${rule.entry.join("・")} からだけ読む` });
      }
    }
  }
  return out;
}

/** 強連結成分（Tarjan）。next(v) は v から出る辺の行き先 */
function stronglyConnected(nodes, next) {
  let index = 0;
  const order = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const out = [];
  const visit = (v) => {
    order.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of next(v)) {
      if (!order.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), order.get(w)));
    }
    if (low.get(v) !== order.get(v)) return;
    const component = [];
    let w;
    do {
      w = stack.pop();
      onStack.delete(w);
      component.push(w);
    } while (w !== v);
    out.push(component);
  };
  for (const v of nodes) if (!order.has(v)) visit(v);
  return out;
}

/** 兄弟のフォルダの循環: parents に合うフォルダの直下のフォルダを点、その中のファイルの import を辺にして、2 つ以上の強連結成分を出す */
export function findSiblingCycles(graph, config) {
  const out = [];
  const dirs = [...new Set([...graph.keys()].flatMap(ancestors))].sort();
  for (const rule of config.siblingCycles ?? []) {
    for (const parent of dirs.filter((d) => matchesAny(d, rule.parents))) {
      // 直下のフォルダの名前。parent の直下のファイルと parent の外は点にしない
      const childOf = (file) => {
        if (!file.startsWith(`${parent}/`)) return null;
        const rest = file.slice(parent.length + 1).split("/");
        return rest.length > 1 ? rest[0] : null;
      };
      const edges = new Map();
      for (const [file, list] of graph) {
        const from = childOf(file);
        if (from === null || skipsTest(file, rule, config)) continue;
        if (!edges.has(from)) edges.set(from, new Set());
        for (const edge of list) {
          const to = edge.path ? childOf(edge.path) : null;
          if (to !== null && to !== from) edges.get(from).add(to);
        }
      }
      for (const component of stronglyConnected([...edges.keys()].sort(), (v) => edges.get(v) ?? [])) {
        if (component.length < 2) continue;
        const members = component.sort();
        out.push({ kind: "cycle", key: `cycle:${rule.name}:${parent}:${members.join(",")}`, message: `${parent}: 直下のフォルダ ${members.join("・")} が互いに読み合っている（兄弟のフォルダは循環させない）` });
      }
    }
  }
  return out;
}

const NATIVE = /\b(?:window|globalThis)\.kickoff\b/;

/** window.kickoff を触ってよい場所: コメントの行を除いて window.kickoff・globalThis.kickoff を書いたファイルが allow に入るか */
export function checkNativeAccess(sources, config) {
  const rule = config.nativeAccess ?? {};
  const out = [];
  for (const [file, source] of sources) {
    if (!matchesAny(file, rule.files ?? []) || matchesAny(file, rule.allow ?? []) || skipsTest(file, rule, config)) continue;
    const touches = source.split("\n").some((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && NATIVE.test(line));
    if (touches) out.push({ kind: "native", key: `native:${file}`, message: `${file}: window.kickoff は決めたファイル（${(rule.allow ?? []).join("・")}）からだけ触る` });
  }
  return out;
}

/** 置かないファイル: deny の glob に合うファイル（except を除く）があるか */
export function checkPlacement(files, config) {
  const out = [];
  for (const rule of config.placement ?? []) {
    for (const file of files) {
      if (!matchesAny(file, rule.deny) || (rule.except && matchesAny(file, rule.except))) continue;
      out.push({ kind: "placement", key: `placement:${rule.name}:${file}`, message: `${file}: ${rule.message}` });
    }
  }
  return out;
}

/** 読み手の機能の名前（src/features/<機能>/ の下でなければ、機能でない読み手の印 "" ） */
const featureOf = (file) => /^src\/features\/([^/]+)\//.exec(file)?.[1] ?? "";

/**
 * 1 つの機能だけが読む土台のファイル（警告。基準線に載せない）: テストでない読み手が 1 つの機能のファイルだけで、
 * ほかの土台・組み立てが読まないもの。keep に合うものは外す。{ file, feature } の並びを返す
 */
export function findSingleUse(graph, config) {
  const rule = config.singleUse;
  if (!rule) return [];
  const readers = new Map();
  for (const [file, edges] of graph) {
    if (matchesAny(file, config.tests ?? [])) continue;
    for (const edge of edges) {
      if (!edge.path || edge.path === file || !matchesAny(edge.path, rule.files) || matchesAny(edge.path, rule.keep ?? [])) continue;
      const set = readers.get(edge.path) ?? new Set();
      set.add(featureOf(file));
      readers.set(edge.path, set);
    }
  }
  const out = [];
  for (const [file, set] of readers) {
    const [only] = set;
    if (set.size === 1 && only !== "") out.push({ file, feature: only });
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : 1));
}
