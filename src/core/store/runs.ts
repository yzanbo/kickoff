import type { DatabaseSync } from "node:sqlite";
import { legacyRunOptions } from "../legacyValues.js";
import type { NewRun, Run, RunEvent, RunEventData, RunStatus, SearchHit } from "../types.js";
import { touchProject, updateRow, type Notify, type Row } from "./common.js";

/** チャットの一覧の絞り込み */
export interface RunFilter {
  projectId?: number;
  taskId?: number;
  statuses?: RunStatus[];
  limit?: number;
  includeArchived?: boolean;
  onlyArchived?: boolean;
}

/** チャットの変えられる項目 */
export type RunPatch = Partial<
  Pick<
    Run,
    | "title"
    | "status"
    | "session_id"
    | "model"
    | "effort"
    | "permission_mode"
    | "fast_mode"
    | "cost_usd"
    | "num_turns"
    | "result"
    | "error"
    | "attention"
    | "archived_at"
    | "context_tokens"
    | "context_window"
    | "branch"
    | "turn_started_at"
  >
>;

const RUN_COLUMNS = [
  "branch",
  "turn_started_at",
  "attention",
  "archived_at",
  "context_tokens",
  "context_window",
  "fast_mode",
  "title",
  "status",
  "session_id",
  "model",
  "effort",
  "permission_mode",
  "cost_usd",
  "num_turns",
  "result",
  "error",
] as const;

interface EventRow {
  id: number;
  run_id: number;
  type: RunEvent["type"];
  data: string;
  created_at: string;
}

/** キーワードの前後を切り出す（前 40 文字・後ろ 80 文字程度） */
function snippetAround(text: string, keyword: string): { snippet: string; match_start: number; match_end: number } {
  const flat = text.replace(/\s+/g, " ");
  const index = flat.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return { snippet: flat.slice(0, 120), match_start: 0, match_end: 0 };
  const start = Math.max(0, index - 40);
  const end = Math.min(flat.length, index + keyword.length + 80);
  const prefix = start > 0 ? "…" : "";
  const snippet = `${prefix}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
  const matchStart = prefix.length + index - start;
  return { snippet, match_start: matchStart, match_end: matchStart + keyword.length };
}

/** DB の行をアプリの型に変換する（以前の権限モード・推論の深さは legacyValues で読み替える） */
function toRun(row: unknown): Run {
  const r = row as Run;
  return { ...r, ...legacyRunOptions(r) };
}

/** チャット（エージェントとの会話セッション）と、その記録（run_events）・検索 */
export function createRunStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Run | undefined => {
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    return row ? toRun(row) : undefined;
  };
  /** 1 列だけ変えて、変更を知らせる（updated_at は進めない: 並び順を変えない操作に使う） */
  const setColumn = (id: number, column: "attention" | "pinned" | "group_id", value: number | null): Run => {
    db.prepare(`UPDATE runs SET ${column} = ? WHERE id = ?`).run(value, id);
    const run = get(id)!;
    onChange({ type: "run", run });
    return run;
  };
  const inWorktree = (projectId: number, worktreePath: string): Run[] =>
    db.prepare("SELECT * FROM runs WHERE project_id = ? AND worktree_path = ? ORDER BY id").all(projectId, worktreePath).map(toRun);

  return {
    get,
    list(filter: RunFilter = {}): Run[] {
      const where: string[] = filter.onlyArchived ? ["archived_at IS NOT NULL"] : filter.includeArchived ? [] : ["archived_at IS NULL"];
      const params: Row = {};
      if (filter.projectId !== undefined) {
        where.push("project_id = $project_id");
        params.project_id = filter.projectId;
      }
      if (filter.taskId !== undefined) {
        where.push("task_id = $task_id");
        params.task_id = filter.taskId;
      }
      if (filter.statuses?.length) {
        where.push(`status IN (${filter.statuses.map((s) => `'${s}'`).join(",")})`);
      }
      const sql = `SELECT * FROM runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ${filter.limit ?? 100}`;
      return db.prepare(sql).all(params).map(toRun);
    },
    create(input: NewRun): Run {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO runs (project_id, task_id, phase, provider, title, status, model, effort, permission_mode, fast_mode, group_id, worktree_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.project_id,
          input.task_id,
          input.phase,
          input.provider,
          input.title,
          input.status,
          input.model,
          input.effort ?? null,
          input.permission_mode ?? "default",
          input.fast_mode ? 1 : 0,
          input.group_id ?? null,
          input.worktree_path ?? "",
        );
      const run = get(Number(lastInsertRowid))!;
      touchProject(db, run.project_id);
      onChange({ type: "run", run });
      return run;
    },
    update(id: number, patch: RunPatch): Run {
      updateRow(db, "runs", id, patch as Row, RUN_COLUMNS);
      const run = get(id)!;
      onChange({ type: "run", run });
      return run;
    },
    /** チャットを完全に削除する（会話の記録も消える） */
    delete(id: number) {
      const run = get(id);
      if (!run) return;
      db.prepare("DELETE FROM runs WHERE id = ?").run(id);
      onChange({ type: "run_deleted", id, project_id: run.project_id });
    },
    /** 確認待ち（未読）の印を付ける・外す。最後に動いた時刻（一覧の並び順）は変えない */
    setAttention: (id: number, attention: boolean) => setColumn(id, "attention", attention ? 1 : 0),
    /** サイドバーの上に固定する・やめる（最後に動いた時刻（並び順）は変えない） */
    setPinned: (id: number, pinned: boolean) => setColumn(id, "pinned", pinned ? 1 : 0),
    /** チャットをグループへ移す（null でグループから外す）。並び順が変わらないよう更新日時は進めない */
    setGroup: (id: number, groupId: number | null) => setColumn(id, "group_id", groupId),
    /**
     * 完了したまま days 日たったチャットをアーカイブする（自動のアーカイブ）。アーカイブした数を返す。
     * 完了 = 終わっていて（完了・中断）、確認待ちの印がなく、固定していないもの（エラー・回答待ち・作業中・固定したものはしない）
     */
    archiveStale(days: number, now = new Date()): number {
      const before = new Date(now.getTime() - days * 86_400_000).toISOString();
      const rows = db
        .prepare(
          "SELECT id FROM runs WHERE archived_at IS NULL AND status IN ('completed', 'cancelled') AND attention = 0 AND pinned = 0 AND updated_at < ?",
        )
        .all(before) as { id: number }[];
      const at = now.toISOString();
      for (const { id } of rows) {
        db.prepare("UPDATE runs SET archived_at = ? WHERE id = ?").run(at, id);
        onChange({ type: "run", run: get(id)! });
      }
      return rows.length;
    },
    /** その作業場所（ワークツリー）を使っているチャット */
    inWorktree,
    /** ワークツリーを片付けたあと、そこで作業していたチャットの作業場所を本体に戻す（並び順は変えない） */
    clearWorktree(projectId: number, worktreePath: string): void {
      const runs = inWorktree(projectId, worktreePath);
      db.prepare("UPDATE runs SET worktree_path = '' WHERE project_id = ? AND worktree_path = ?").run(projectId, worktreePath);
      for (const run of runs) onChange({ type: "run", run: get(run.id)! });
    },
    addEvent(runId: number, event: RunEventData): RunEvent {
      const { type, ...data } = event;
      const { lastInsertRowid } = db.prepare("INSERT INTO run_events (run_id, type, data) VALUES (?, ?, ?)").run(runId, type, JSON.stringify(data));
      const row = db.prepare("SELECT * FROM run_events WHERE id = ?").get(Number(lastInsertRowid)) as unknown as EventRow;
      const saved: RunEvent = { ...row, data: JSON.parse(row.data) };
      const run = get(runId);
      if (run) onChange({ type: "run_event", project_id: run.project_id, event: saved });
      return saved;
    },
    listEvents(runId: number): RunEvent[] {
      const rows = db.prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY id ASC").all(runId) as unknown as EventRow[];
      return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
    },
    /**
     * チャットのやり取り（自分の発言と AI の返答）をキーワードで検索する。新しい順。
     * 大文字・小文字は区別しない（ASCII のみ。SQLite の LIKE の仕様）。
     */
    searchEvents(query: string, filter: { projectId?: number; runId?: number; limit?: number } = {}): SearchHit[] {
      const keyword = query.trim();
      if (!keyword) return [];
      const where = ["e.type IN ('user', 'text')", "json_extract(e.data, '$.text') LIKE $pattern ESCAPE '\\'"];
      const params: Row = { pattern: `%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%` };
      if (filter.projectId !== undefined) {
        where.push("r.project_id = $project_id");
        params.project_id = filter.projectId;
      }
      if (filter.runId !== undefined) {
        where.push("e.run_id = $run_id");
        params.run_id = filter.runId;
      }
      const rows = db
        .prepare(
          `SELECT e.id AS event_id, e.run_id, r.project_id, r.title AS run_title, r.phase, e.type,
                  json_extract(e.data, '$.text') AS text, e.created_at
           FROM run_events e JOIN runs r ON r.id = e.run_id
           WHERE ${where.join(" AND ")}
           ORDER BY e.id DESC LIMIT ${Math.min(filter.limit ?? 50, 200)}`,
        )
        .all(params) as (Omit<SearchHit, "snippet" | "match_start" | "match_end"> & { text: string })[];
      return rows.map(({ text, ...row }) => ({ ...row, ...snippetAround(text, keyword) }));
    },
  };
}
