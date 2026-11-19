// SQL のタブの結果の言葉: 結果のタブの名前・メッセージの行・下の帯の環境の一文
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import { durationLabel } from "./dbFormat";
import type { StatementRun } from "./SqlRunResult";

/** 結果のタブの名前（「結果 1 · 24 行」「結果 2 · 3 行を変えた」「結果 3 · 失敗」） */
export function runTabLabel(run: StatementRun, index: number): string {
  return `結果 ${index + 1} · ${runOutcome(run, true)}`;
}

/** 1 つの文の結果を短く（short はタブ用で、時間を付けない） */
export function runOutcome(run: StatementRun, short = false): string {
  if (run.skipped) return "流していない";
  if (run.stopped) return "止めた";
  if (run.evicted) return "捨てた";
  if (run.error) return "失敗";
  const r = run.result;
  if (!r) return "流しています…";
  const what = r.columns.length > 0 ? `${r.rows.length.toLocaleString()} 行${r.truncated ? "（続きあり）" : ""}` : r.affected != null ? `${r.affected.toLocaleString()} 行を変えた` : "流した";
  return short ? what : `${what} · ${durationLabel(r.duration_ms)}`;
}

/** 下の帯の環境の一文（「ステージング（書き込みは確認してから流す）」）。流す前にどう確かめるかを思い出させる */
export function envSentence(c: Pick<DbConnection, "environment" | "read_only" | "write_check">): string {
  const how = c.read_only ? "読み取り専用" : c.write_check === "all" ? "書き込みは確認してから流す" : c.write_check === "env_name" ? "書き込みは環境の名前を打ってから流す" : "危険な文だけ確かめる";
  return `${DB_ENVIRONMENT_LABELS[c.environment]}（${how}）`;
}
