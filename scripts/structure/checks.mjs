// 構造の検査（scripts/check-structure.mjs）の種類のうち、import のグラフと行の数で見るもの。
// どれも違反 { kind, key, message, value? } の並びを返す。key は基準線に載る文字
import { expandLayers, matchesAny } from "./parse.mjs";

/** テストとして扱うファイルを、決まりの tests（既定 include）に合わせて外すか */
function skipsTest(file, rule, config, fallback = "include") {
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
    for (const [file, edges] of graph) {
      if (!matchesAny(file, from) || skipsTest(file, rule, config)) continue;
      for (const edge of edges) {
        if (edge.typeOnly && rule.typeOnlyAllowed) continue;
        const bad = edge.path
          ? (allow && !matchesAny(edge.path, allow)) || (deny && matchesAny(edge.path, deny))
          : (rule.allowModules && !matchesAny(edge.module, rule.allowModules)) || (rule.denyModules && matchesAny(edge.module, rule.denyModules));
        if (bad) out.push({ kind: "import", key: `import:${rule.name}:${file} -> ${edge.path ?? edge.module}`, message: `${file}: ${rule.message}` });
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
