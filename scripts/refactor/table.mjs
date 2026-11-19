// 作り直しの移動表の読み方・検査・組み立て（scripts/refactor/move.mjs が使う。作り直しが終わったら scripts/refactor ごと消す）
import path from "node:path";

/** 新しい構成の機能（下の層から。scripts/structure.config.mjs の機能の並びと同じ） */
export const FEATURES = [
  "settings", "panel", "palette", "trash", "projects", "groups", "ai", "chat", "guard", "attachments",
  "composer", "snippets", "compact", "subagents", "childChats", "visuals", "remoteImages", "providerSwitch",
  "workplaceMove", "queue", "userView", "notifications", "conversation", "chatList", "chatPanel", "files",
  "git", "docker", "worktrees", "github", "notes", "database", "terminal", "browser", "ports", "voice",
  "devices", "diagnostics", "sidebar", "board",
];

/** 行き先の決まりに合わないまま残すと決めた行（あとの段で解いて消す） */
export const KNOWN_EXCEPTIONS = new Map([
  ["src/shared/types/index.ts", "束ねの @shared/types。取り決めを作り直す段で解いて消す"],
  ["src/shared/CLAUDE.md", "中身を配るまで動かさない（説明を仕上げる段で消す）"],
]);

const MIDDLE_CLAUDE = new Set(["src/features/CLAUDE.md", "src/foundation/CLAUDE.md", "src/shared/CLAUDE.md"]);

/** ```tsv の塊の中身（塊がなければ全体） */
function tsvBlocks(text) {
  const blocks = [...text.matchAll(/^```tsv\n([\s\S]*?)^```/gm)].map((m) => m[1]);
  return blocks.length > 0 ? blocks : [text];
}

/** 塊の行を [列…] にする（空行と # の行は飛ばす。列が 2〜3 でなければ投げる） */
function rowsOf(block) {
  const out = [];
  for (const line of block.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 2 || cols.length > 3) throw new Error(`移動表の行の列が 2〜3 ではありません: ${line}`);
    out.push(cols);
  }
  return out;
}

/** 移動表を読む。3 列目（理由）は捨て、2 列目が "-" の行（その段で消すファイル）は外す */
export function parseMoveTable(text) {
  return tsvBlocks(text)
    .flatMap(rowsOf)
    .filter(([, to]) => to !== "-")
    .map(([from, to]) => ({ from, to }));
}

/** 行き先の置き場所の問題（なければ null） */
function placeProblem(to) {
  if (MIDDLE_CLAUDE.has(to)) return { kind: "middle-claude", path: to };
  const parts = to.split("/");
  if (parts[0] !== "src") return { kind: "bad-root", path: to };
  const [, top, second, third] = parts;
  const deep = parts.length >= 4;
  if (top === "shared") {
    if (second === "foundation" && deep) return null;
    if (!deep) return { kind: "bad-root", path: to };
    return FEATURES.includes(second) ? null : { kind: "unknown-feature", path: to, feature: second };
  }
  if (top === "foundation") return ["core", "ui", "desktop"].includes(second) && deep ? null : { kind: "bad-root", path: to };
  if (top === "app") return ["shared", "core", "desktop", "renderer"].includes(second) && deep ? null : { kind: "bad-root", path: to };
  if (top === "features") {
    if (parts.length < 4) return { kind: "bad-root", path: to };
    if (!FEATURES.includes(second)) return { kind: "unknown-feature", path: to, feature: second };
    if (parts.length === 4 && third === "CLAUDE.md") return null;
    return ["core", "ui", "desktop", "worker", "testing"].includes(third) && parts.length >= 5 ? null : { kind: "bad-root", path: to };
  }
  return { kind: "bad-root", path: to };
}

/** テストのファイルの対象（x.test.ts → x.ts / x.tsx）の候補 */
function testTargets(file) {
  const m = /^(.*)\.test\.(ts|tsx)$/.exec(file);
  return m ? [`${m[1]}.ts`, `${m[1]}.tsx`] : [];
}

/**
 * 表の検査。files は `git ls-files src` の結果。partial のときは表にないファイルを数えない（一部のファイルだけの表）
 * @returns {Array<{ kind: string } & Record<string, unknown>>} 問題の並び（なければ []）
 */
export function checkTable(rows, files, { partial = false } = {}) {
  const problems = [];
  const fileSet = new Set(files);
  const byFrom = new Map();
  for (const row of rows) {
    if (byFrom.has(row.from)) problems.push({ kind: "duplicate-from", path: row.from });
    byFrom.set(row.from, row.to);
    if (!fileSet.has(row.from)) problems.push({ kind: "unknown", path: row.from });
  }
  if (!partial) for (const file of files) if (!byFrom.has(file)) problems.push({ kind: "missing", path: file });
  const byTo = new Map();
  const byLower = new Map();
  for (const [from, to] of byFrom) {
    byTo.set(to, [...(byTo.get(to) ?? []), from]);
    const lower = to.toLowerCase();
    const other = byLower.get(lower);
    if (other !== undefined && other !== to) problems.push({ kind: "case-collision", a: other, b: to });
    else byLower.set(lower, to);
    if (KNOWN_EXCEPTIONS.has(to) && from === to) continue;
    const place = placeProblem(to);
    if (place) problems.push(place);
  }
  for (const [to, froms] of byTo) if (froms.length > 1) problems.push({ kind: "duplicate-to", path: to, froms });
  for (const [from, to] of byFrom) {
    for (const target of testTargets(from)) {
      const targetTo = byFrom.get(target);
      if (targetTo !== undefined && path.posix.dirname(targetTo) !== path.posix.dirname(to)) problems.push({ kind: "test-apart", test: from, target });
    }
  }
  return problems;
}

/** 問題を 1 行の文にする */
export function formatProblem(p) {
  if (p.kind === "duplicate-to") return `${p.kind}\t${p.path}\t${p.froms.join(" ")}`;
  if (p.kind === "case-collision") return `${p.kind}\t${p.a}\t${p.b}`;
  if (p.kind === "unknown-feature") return `${p.kind}\t${p.path}\t${p.feature}`;
  if (p.kind === "test-apart") return `${p.kind}\t${p.test}\t${p.target}`;
  return `${p.kind}\t${p.path}`;
}

/** 分冊の「## 5.」の節の中の ```tsv の行（3 列: 旧・新・理由） */
export function fixRowsOf(text) {
  const section = /^## 5\.[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!section) return [];
  const blocks = [...section[1].matchAll(/^```tsv\n([\s\S]*?)^```/gm)].map((m) => m[1]);
  return blocks.flatMap(rowsOf).map(([from, to, reason = ""]) => ({ from, to, reason }));
}

/** 付録の表を読む（3 列目の理由も持つ。merge だけが使う） */
export function parseBaseTable(text) {
  return tsvBlocks(text)
    .flatMap(rowsOf)
    .map(([from, to, reason = ""]) => ({ from, to, reason }));
}

/** 理由の頭の「分冊 NN:」（その行を決めた分冊） */
function ownerOf(reason) {
  return /^分冊 (\d\d):/.exec(reason)?.[1] ?? null;
}

/**
 * 付録の表（base。3 列目の理由つき）に各分冊の直し（fixes = [{ name, rows }]）を当てる。決まり:
 * - 行き先がパスでない直し（"-"・「（消す）」= その段で消す）は当てない（P2 ではまだあるので base の行き先のまま動かす）
 * - 旧パスが "/" で終わる行は、そのフォルダの中で、どの分冊もファイルの行を書いていない残りに当てる
 * - base の理由に「分冊 NN:」がある行は、その分冊の決めとして base の行き先を採る（付録を正とする。分冊の直しが違えば rejected）
 * - それ以外は直しの行き先。分冊どうしで違えば base と同じものを採り、どれも違えば unresolved
 * - テスト（x.test.ts）は対象（x.ts）と同じフォルダへ（名前は直しのまま）
 * - 行き先が重なる直しは当てない（base の行き先に戻す）
 * 採らなかった直しは rejected、決まらなければ unresolved
 */
export function mergeTables(base, fixes) {
  const result = new Map(base.map((r) => [r.from, r.to]));
  const owner = new Map(base.map((r) => [r.from, ownerOf(r.reason)]));
  const candidates = new Map();
  const add = (from, to, name, reason) => candidates.set(from, [...(candidates.get(from) ?? []), { to, name, reason }]);
  const explicit = new Set(fixes.flatMap((f) => f.rows.filter((r) => !r.from.endsWith("/")).map((r) => r.from)));
  for (const { name, rows } of fixes) {
    for (const row of rows) {
      if (!row.to.startsWith("src/")) continue;
      if (!row.from.endsWith("/")) {
        add(row.from, row.to, name, row.reason);
        continue;
      }
      for (const from of result.keys()) {
        if (from.startsWith(row.from) && !explicit.has(from)) add(from, row.to + from.slice(row.from.length), name, row.reason);
      }
    }
  }
  const rejected = [];
  const unresolved = [];
  const reject = (from, c, why) => rejected.push({ from, ...c, why });
  for (const [from, list] of candidates) {
    const baseTo = result.get(from);
    const tos = [...new Set(list.map((c) => c.to))];
    let chosen;
    if (owner.get(from)) chosen = baseTo;
    else if (tos.length === 1) chosen = tos[0];
    else if (tos.includes(baseTo)) chosen = baseTo;
    else {
      unresolved.push({ from, candidates: list });
      continue;
    }
    result.set(from, chosen);
    for (const c of list) if (c.to !== chosen) reject(from, c, owner.get(from) ? `付録は分冊 ${owner.get(from)} の行` : "base と同じ行き先を採った");
  }
  // テストは対象と同じフォルダへ
  for (const [from, to] of result) {
    for (const target of testTargets(from)) {
      const targetTo = result.get(target);
      if (targetTo === undefined || path.posix.dirname(targetTo) === path.posix.dirname(to)) continue;
      const next = `${path.posix.dirname(targetTo)}/${path.posix.basename(to)}`;
      for (const c of candidates.get(from) ?? []) if (c.to === to) reject(from, c, "テストが対象と別のフォルダになる");
      result.set(from, next);
    }
  }
  // 行き先が重なる直しは base に戻す
  const counts = new Map();
  for (const to of result.values()) counts.set(to, (counts.get(to) ?? 0) + 1);
  const baseOf = new Map(base.map((r) => [r.from, r.to]));
  for (const [from, to] of result) {
    if (counts.get(to) < 2 || baseOf.get(from) === to) continue;
    for (const c of candidates.get(from) ?? []) if (c.to === to) reject(from, c, "行き先がほかのファイルと重なる");
    result.set(from, baseOf.get(from));
  }
  return { rows: [...result].map(([from, to]) => ({ from, to })), rejected, unresolved };
}
