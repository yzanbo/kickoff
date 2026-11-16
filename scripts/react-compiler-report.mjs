// React Compiler の報告（electron.vite.config.ts の画面のビルドに差し込む。メモの仕様書「0023_表示を軽くする」の案 17）。
// コンパイラの logger の知らせ（最適化した / 外した）を集め、ビルドの終わりに out/react-compiler-report.json に書いて数を出す。
// 外した部品・hooks が許した一覧（src/renderer/react-compiler-skips.json。「ファイル:関数名」と理由の文）にないときは、ビルドを失敗にする
// （npm run build のまま、効かない部品が黙って増えないように）。テストは隣の react-compiler-report.test.mjs（.mjs にするのは、軽い組に入れるため）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const NAME = /[A-Za-z_$][\w$]*/.source;

/**
 * 関数の始まりの位置（行の文字と列）から関数の名前を拾う（外した知らせ CompileError には名前がないため）。
 * function Foo( / const Foo = ( / const Foo = memo(function ( / export const useFoo = () の形を読む。読めなければ null
 */
export function functionNameAt(lineText, column) {
  const after = lineText.slice(column);
  const named = new RegExp(`^(?:async\\s+)?function\\s*\\*?\\s*(${NAME})`).exec(after);
  if (named) return named[1];
  const assigned = new RegExp(`(?:const|let|var)\\s+(${NAME})\\s*(?::[^=]+)?=\\s*(?:${NAME}\\(\\s*)*$`).exec(lineText.slice(0, column));
  return assigned ? assigned[1] : null;
}

/** 知らせ 1 件を、報告の記録（ファイル・関数名・行・最適化したか・外した理由）に直す。報告に使わない知らせは null */
export function recordOf(file, event, lineText) {
  if (!event.fnLoc) return null;
  const line = event.fnLoc.start.line;
  const fn = (event.kind === "CompileSuccess" ? event.fnName : null) ?? functionNameAt(lineText ?? "", event.fnLoc.start.column) ?? `<無名>@${line}`;
  if (event.kind === "CompileSuccess") return { file, fn, line, compiled: true, reason: null, at: null };
  if (event.kind === "CompileError") {
    const loc = event.detail.primaryLocation?.() ?? event.detail.loc;
    return { file, fn, line, compiled: false, reason: `${event.detail.category ?? "Error"}: ${event.detail.reason}`, at: loc?.start?.line ?? null };
  }
  if (event.kind === "CompileSkip") return { file, fn, line, compiled: false, reason: event.reason, at: event.loc?.start.line ?? null };
  if (event.kind === "PipelineError") return { file, fn, line, compiled: false, reason: `PipelineError: ${String(event.data).split("\n")[0]}`, at: null };
  return null;
}

/**
 * 記録を数にまとめる。skipped は外した関数（理由はまとめて）、unexpected は許した一覧にない外れ、stale は一覧にあるのに外れていないもの
 * （直ったら一覧から消す）。同じ関数（ファイルと行）に最適化と外れの両方があれば最適化したとみなす
 */
export function summarize(records, allowList) {
  const byFn = new Map();
  for (const r of records) {
    const id = `${r.file}:${r.line}`;
    const prev = byFn.get(id);
    const f = prev ?? { file: r.file, fn: r.fn, line: r.line, compiled: false, reasons: [], at: [] };
    if (!prev) byFn.set(id, f);
    f.compiled ||= r.compiled;
    if (r.reason && !f.reasons.includes(r.reason)) f.reasons.push(r.reason);
    if (r.at != null && !f.at.includes(r.at)) f.at.push(r.at);
  }
  const fns = [...byFn.values()];
  const skipped = fns
    .filter((f) => !f.compiled)
    .map((f) => ({ key: `${f.file}:${f.fn}`, line: f.line, reasons: f.reasons, at: f.at.sort((a, b) => a - b) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const byReason = {};
  for (const s of skipped) for (const reason of s.reasons) byReason[reason] = (byReason[reason] ?? 0) + 1;
  const skippedKeys = new Set(skipped.map((s) => s.key));
  return {
    compiled: fns.filter((f) => f.compiled).length,
    skipped,
    byReason,
    unexpected: skipped.filter((s) => !(s.key in allowList)).map((s) => s.key),
    stale: Object.keys(allowList).filter((key) => !skippedKeys.has(key)),
  };
}

/** 報告の終わりに出す文（数・理由ごとの数・一覧の外れ） */
export function reportLines(summary) {
  const lines = [`React Compiler: 最適化した部品・hooks ${summary.compiled}・外した ${summary.skipped.length}`];
  for (const [reason, n] of Object.entries(summary.byReason).sort((a, b) => b[1] - a[1])) lines.push(`  ${n} ${reason}`);
  for (const key of summary.stale) lines.push(`  許した一覧にあるが外れていない（一覧から消す）: ${key}`);
  return lines;
}

/**
 * ビルドの差し込みと、コンパイラに渡す logger を作る。allowList は許した一覧の JSON のパス、out は報告の JSON の書き出し先
 * （どちらもリポジトリの根からの相対パス）
 */
export function reactCompilerReport({ allowList, out = "out/react-compiler-report.json", root = process.cwd() }) {
  const records = new Map();
  const sources = new Map();
  const lineOf = (file, line) => {
    if (!sources.has(file)) sources.set(file, existsSync(file) ? readFileSync(file, "utf8").split("\n") : []);
    return sources.get(file)[line - 1];
  };
  const logger = {
    logEvent(filename, event) {
      if (!filename || !event.fnLoc) return;
      const file = relative(root, filename);
      const record = recordOf(file, event, lineOf(filename, event.fnLoc.start.line));
      if (!record) return;
      const id = `${file}:${record.line}:${record.compiled}:${record.reason}`;
      records.set(id, record);
    },
  };
  const plugin = {
    name: "kickoff-react-compiler-report",
    apply: "build",
    buildStart() {
      records.clear();
      sources.clear();
    },
    writeBundle() {
      const allowed = JSON.parse(readFileSync(resolve(root, allowList), "utf8"));
      const summary = summarize([...records.values()], allowed);
      const outPath = resolve(root, out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(summary, null, 1)}\n`);
      for (const line of reportLines(summary)) console.log(line);
      if (summary.unexpected.length) {
        throw new Error(
          `React Compiler が最適化できなかった部品・hooks があります（理由は ${out}。書き方を直すか、"use no memo" と理由を書いて ${allowList} に足す）:\n${summary.unexpected.join("\n")}`,
        );
      }
    },
  };
  return { logger, plugin };
}
