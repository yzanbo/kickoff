// Docker のログの画面の純粋な関数: 行の並べ方（時刻の順に混ぜる・上限）・札・エラーと警告の見分け・JSON の整え・区切りの文・AI に渡す文
import type { DockerCompose, DockerLogSource } from "@shared/types";
import { stripAnsi } from "./ansi";
import { workplaceText } from "./dockerView";

/** 画面に持つ行の数（超えたら古い行から捨てる。さかのぼればまた読める） */
export const LOG_ROW_LIMIT = 10_000;
/** 「AI に聞く」で足す前後の行の数 */
export const ASK_CONTEXT_LINES = 20;

/** 画面の 1 行（ログの行か、止まった・起動したの区切り） */
export type LogRow =
  | { id: number; kind: "line"; container: string; ts: string; text: string }
  | { id: number; kind: "stopped"; container: string; ts: string; exit_code: number | null }
  | { id: number; kind: "started"; container: string; ts: string };

/** 時刻を小数 9 桁の形にそろえる（文字のまま比べて並べるため。コアの docker logs の時刻と同じ形） */
export function normTs(iso: string): string {
  const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/.exec(iso);
  return m ? `${m[1]}.${(m[2] ?? "").padEnd(9, "0").slice(0, 9)}Z` : iso;
}

/** 時刻の順に並べる（時刻が同じなら元の順。時刻のない行は前の行と同じ時刻にしてから渡す） */
const sortByTs = (rows: LogRow[]) => rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.ts === b.r.ts ? a.i - b.i : a.r.ts < b.r.ts ? -1 : 1)).map((x) => x.r);

/**
 * 並んだ rows に added を時刻の順に混ぜる（同じ時刻は前からあるものを先に）。ほとんどは新しい行を後ろに足すだけなので、
 * そのときは混ぜずにつなぐ。上限を超えたら古い行から捨て、捨てた行を dropped で返す
 */
export function mergeRows(rows: LogRow[], added: LogRow[], limit = LOG_ROW_LIMIT): { rows: LogRow[]; dropped: LogRow[] } {
  if (added.length === 0) return { rows, dropped: [] };
  const sorted = sortByTs(added);
  let merged: LogRow[];
  if (rows.length === 0 || sorted[0].ts >= rows[rows.length - 1].ts) merged = rows.concat(sorted);
  else {
    merged = [];
    let i = 0;
    let j = 0;
    while (i < rows.length || j < sorted.length) {
      if (j >= sorted.length || (i < rows.length && rows[i].ts <= sorted[j].ts)) merged.push(rows[i++]);
      else merged.push(sorted[j++]);
    }
  }
  const over = merged.length - limit;
  return over > 0 ? { rows: merged.slice(over), dropped: merged.slice(0, over) } : { rows: merged, dropped: [] };
}

/** 時刻のない行に、前の行の時刻を入れる（コアは時刻の付いていない行を空の時刻で送る） */
export function fillTs<T extends { ts: string }>(lines: T[], before: string): T[] {
  let last = before;
  return lines.map((l) => {
    if (l.ts) {
      last = l.ts;
      return l;
    }
    return { ...l, ts: last };
  });
}

/** サービスの札の名前（数を増やしたものの #n を外す。使い捨ては「web · 使い捨て」のまま） */
export const chipOf = (source: Pick<DockerLogSource, "label">) => source.label.replace(/#\d+$/, "");

/** compose のサービスの札の並び（まだ作っていないサービスも。使い捨ては動いたことのあるサービスの後ろに） */
export function logChips(compose: Pick<DockerCompose, "services">, sources: DockerLogSource[]): string[] {
  const names = compose.services.map((s) => s.name);
  for (const s of sources) {
    const chip = chipOf(s);
    if (!names.includes(chip)) names.push(chip);
  }
  return names;
}

/** エラー・警告（行の文字の決まりで見分ける目安。標準出力か標準エラーかは使わない） */
export type LogLevel = "error" | "warn";

const ERROR_WORDS = /\b(?:ERROR|FATAL|CRITICAL|PANIC|EMERG|ALERT)\b|\bpanic:|Traceback \(most recent call last\)|\b[A-Z]\w*(?:Exception|Error)\b/;
const ERROR_MARKS = /\[(?:error|crit|alert|emerg|fatal)\]|\blevel=["']?(?:error|fatal|critical|panic)\b|"(?:level|severity|lvl)"\s*:\s*"(?:error|fatal|critical|panic)"|^\s*E\d{4} /im;
const WARN_WORDS = /\b(?:WARN|WARNING)\b/;
const WARN_MARKS = /\[warn(?:ing)?\]|\blevel=["']?warn(?:ing)?\b|"(?:level|severity|lvl)"\s*:\s*"warn(?:ing)?"|^\s*W\d{4} /im;

export function logLevelOf(text: string): LogLevel | null {
  const plain = stripAnsi(text);
  if (ERROR_WORDS.test(plain) || ERROR_MARKS.test(plain)) return "error";
  if (WARN_WORDS.test(plain) || WARN_MARKS.test(plain)) return "warn";
  return null;
}

/** JSON の行を整えた文（オブジェクトか配列の 1 行だけ。ほかは null） */
export function prettyJson(text: string): string | null {
  const plain = stripAnsi(text).trim();
  if (!/^(?:\{.*\}|\[.*\])$/s.test(plain)) return null;
  try {
    const value: unknown = JSON.parse(plain);
    return value !== null && typeof value === "object" ? JSON.stringify(value, null, 2) : null;
  } catch {
    return null;
  }
}

const dateOf = (ts: string) => new Date(ts.replace(/(\.\d{3})\d*Z$/, "$1Z"));
const two = (n: number) => String(n).padStart(2, "0");

/** 行の頭の時刻（この Mac の時刻で「12:01:03.123」） */
export function clockOf(ts: string, millis = true): string {
  const d = dateOf(ts);
  if (Number.isNaN(d.getTime())) return "";
  const base = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  return millis ? `${base}.${String(d.getMilliseconds()).padStart(3, "0")}` : base;
}

/** 止まった・起動したの区切りの文（「db が止まりました（exit 1）12:05:10」） */
export function separatorText(row: Extract<LogRow, { kind: "stopped" | "started" }>, label: string): string {
  const time = clockOf(row.ts, false);
  if (row.kind === "started") return `${label} が起動しました ${time}`;
  return `${label} が止まりました${row.exit_code !== null ? `（exit ${row.exit_code}）` : ""} ${time}`;
}

/** コンテナの名前と札（区切り・AI の文・行の頭に出す） */
export interface LogContainerInfo {
  label: string;
  service: string;
  /** docker のコンテナの名前（myapp-db-1。分からなければ null） */
  name: string | null;
}

/** コンテナの ID → 名前と札（いまの sources と compose の一覧から） */
export function containerInfos(compose: Pick<DockerCompose, "services">, sources: DockerLogSource[]): Map<string, LogContainerInfo> {
  const names = new Map(compose.services.flatMap((s) => [...s.containers, ...s.oneoffs].map((c) => [c.id, c.name] as const)));
  return new Map(sources.map((s) => [s.container, { label: s.label, service: s.service, name: names.get(s.container) ?? null }]));
}

/** 文の中の ``` より長い囲み */
const fenceFor = (text: string) => "`".repeat(Math.max(3, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)));

/**
 * AI に渡す文: 頭に「Docker のログ: 本体 | main・compose.yaml・db（myapp-db-1）・12:01:03〜12:01:09」の文脈、続けてコードのブロック。
 * 行は「時刻 札 | 文」（色の印は外す）。区切りの行も「── … ──」で入れる
 */
export function logQuote(compose: Pick<DockerCompose, "worktree_path" | "branch" | "file" | "project_name">, rows: LogRow[], infos: Map<string, LogContainerInfo>): string {
  const lines = rows.filter((r) => r.kind === "line");
  const containers = [...new Set(rows.map((r) => r.container))];
  const who = containers
    .map((id) => {
      const info = infos.get(id);
      return info ? `${info.label}${info.name ? `（${info.name}）` : ""}` : id.slice(0, 12);
    })
    .join("、");
  const first = lines[0] ?? rows[0];
  const last = lines[lines.length - 1] ?? rows[rows.length - 1];
  const span = first && last ? `${clockOf(first.ts, false)}〜${clockOf(last.ts, false)}` : "";
  const head = ["Docker のログ: " + workplaceText(compose.worktree_path, compose.branch), compose.file ?? compose.project_name ?? "compose", who, span].filter(Boolean).join("・");
  const body = rows.map((r) => rowText(r, infos.get(r.container)?.label ?? r.container.slice(0, 12), containers.length > 1)).join("\n");
  const fence = fenceFor(body);
  return `${head}\n${fence}\n${body}\n${fence}`;
}

/** AI に渡す・コピーする 1 行（札はいくつものコンテナを混ぜたときだけ） */
export function rowText(row: LogRow, label: string, withLabel = true): string {
  if (row.kind !== "line") return `── ${separatorText(row, label)} ──`;
  return `${clockOf(row.ts)} ${withLabel ? `${label} | ` : ""}${stripAnsi(row.text)}`;
}

/** 長い文の札の名前（「db・120 行」） */
export function logCaptureLabel(rows: LogRow[], infos: Map<string, LogContainerInfo>): string {
  const chips = [...new Set(rows.map((r) => infos.get(r.container)?.service ?? r.container.slice(0, 12)))];
  return `${chips.join("・")}・${rows.length} 行`;
}

/** rows の i 番目の前後 n 行（「AI に聞く」） */
export function aroundRow<T>(rows: T[], index: number, n = ASK_CONTEXT_LINES): T[] {
  return rows.slice(Math.max(0, index - n), index + n + 1);
}
