import type { DatabaseSync } from "node:sqlite";
import type { NewRun, Run, RunEvent, RunEventData, RunStatus, SearchHit } from "../types.js";
import { bit, touchProject, updateRow, type Notify, type Row } from "./common.js";

/** チャットの一覧の絞り込み */
export interface RunFilter {
  projectId?: number;
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

/**
 * キーワードの探し方。3 文字（コードポイント）以上は全文検索の索引（trigram）で部分一致を探す（" は 2 つに。% _ はそのまま）。
 * 2 文字以下は trigram の索引が使えないので、生成列 text を LIKE で探す（% _ \ は文字として探す。大文字・小文字は ASCII だけ区別しない）
 */
function keywordMatch(keyword: string): { from: string; where: string[]; params: Row } {
  if ([...keyword].length >= 3) {
    return {
      from: "run_event_search s JOIN run_events e ON e.id = s.rowid",
      where: ["run_event_search MATCH $match"],
      params: { match: `"${keyword.replaceAll('"', '""')}"` },
    };
  }
  const pattern = `%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return { from: "run_events e", where: ["e.text LIKE $pattern ESCAPE '\\'"], params: { pattern } };
}

/** ワークツリーで作業しているチャット（索引 idx_runs_worktree の条件と同じ式。書くと、その索引で引ける） */
const IN_WORKTREE = "worktree_path <> ''";

/** DB の行（真偽値は 0 / 1） */
type RunRow = Omit<Run, "fast_mode" | "attention" | "pinned"> & { fast_mode: number; attention: number; pinned: number };

/** DB の行をアプリの型に変換する（真偽値の列を boolean に） */
function toRun(row: unknown): Run {
  const r = row as RunRow;
  return { ...r, fast_mode: r.fast_mode === 1, attention: r.attention === 1, pinned: r.pinned === 1 };
}

/** 変える項目を DB の列の値にする（真偽値は 0 / 1） */
function toRunRow({ fast_mode, attention, ...rest }: RunPatch): Row {
  return { ...rest, fast_mode: bit(fast_mode), attention: bit(attention) } as Row;
}

/** チャット（エージェントとの会話セッション）と、その記録（run_events）・検索 */
export function createRunStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Run | undefined => {
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    return row ? toRun(row) : undefined;
  };
  /** 1 列だけ変えて、変更を知らせる（active_at は進めない: 並び順を変えない操作に使う） */
  const setColumn = (id: number, column: "attention" | "pinned" | "group_id", value: number | null): Run => {
    db.prepare(`UPDATE runs SET ${column} = ? WHERE id = ?`).run(value, id);
    const run = get(id)!;
    onChange({ type: "run", run });
    return run;
  };
  const inWorktree = (projectId: number, worktreePath: string): Run[] =>
    db.prepare(`SELECT * FROM runs WHERE project_id = ? AND worktree_path = ? AND ${IN_WORKTREE} ORDER BY id`).all(projectId, worktreePath).map(toRun);

  return {
    get,
    list(filter: RunFilter = {}): Run[] {
      const where: string[] = filter.onlyArchived ? ["archived_at IS NOT NULL"] : filter.includeArchived ? [] : ["archived_at IS NULL"];
      const params: Row = {};
      if (filter.projectId !== undefined) {
        where.push("project_id = $project_id");
        params.project_id = filter.projectId;
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
          `INSERT INTO runs (project_id, provider, title, status, model, effort, permission_mode, fast_mode, group_id, worktree_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.project_id,
          input.provider,
          input.title,
          input.status,
          input.model,
          input.effort ?? null,
          input.permission_mode ?? "default",
          bit(input.fast_mode ?? false),
          input.group_id ?? null,
          input.worktree_path ?? "",
        );
      const run = get(Number(lastInsertRowid))!;
      touchProject(db, run.project_id);
      onChange({ type: "run", run });
      return run;
    },
    update(id: number, patch: RunPatch): Run {
      updateRow(db, "runs", id, toRunRow(patch), RUN_COLUMNS, true);
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
    /** 未読の印を付ける・外す。最後に動いた時刻（一覧の並び順）は変えない */
    setAttention: (id: number, attention: boolean) => setColumn(id, "attention", bit(attention)),
    /** サイドバーの上に固定する・やめる（最後に動いた時刻（並び順）は変えない） */
    setPinned: (id: number, pinned: boolean) => setColumn(id, "pinned", bit(pinned)),
    /** チャットをグループへ移す（null でグループから外す）。並び順が変わらないよう更新日時は進めない */
    setGroup: (id: number, groupId: number | null) => setColumn(id, "group_id", groupId),
    /**
     * 完了したまま days 日たったチャットをアーカイブする（自動のアーカイブ）。アーカイブした数を返す。
     * 完了 = 終わっていて（完了・中断）、未読の印がなく、固定していないもの（エラー・回答待ち・作業中・固定したものはしない）
     */
    archiveStale(days: number, now = new Date()): number {
      const before = new Date(now.getTime() - days * 86_400_000).toISOString();
      const rows = db
        .prepare(
          "SELECT id FROM runs WHERE archived_at IS NULL AND status IN ('completed', 'cancelled') AND attention = 0 AND pinned = 0 AND active_at < ?",
        )
        .all(before) as { id: number }[];
      const at = now.toISOString();
      for (const { id } of rows) {
        db.prepare("UPDATE runs SET archived_at = ? WHERE id = ?").run(at, id);
        onChange({ type: "run", run: get(id)! });
      }
      return rows.length;
    },
    /** その作業場所（ワークツリー）を使っているチャット（本体（空）は対象外） */
    inWorktree,
    /** ワークツリーを片付けたあと、そこで作業していたチャットの作業場所を本体に戻す（並び順は変えない） */
    clearWorktree(projectId: number, worktreePath: string): void {
      const runs = inWorktree(projectId, worktreePath);
      db.prepare(`UPDATE runs SET worktree_path = '' WHERE project_id = ? AND worktree_path = ? AND ${IN_WORKTREE}`).run(projectId, worktreePath);
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
    /** 未読にする「新しい結果」（board.ts の isUnreadEvent と同じもの）のうち、いちばん新しい記録の id（なければ 0） */
    latestUnreadEventId(runId: number): number {
      const row = db
        .prepare(
          "SELECT MAX(id) AS id FROM run_events WHERE run_id = ? AND ((type = 'text' AND COALESCE(json_extract(data, '$.sub'), 0) = 0) OR type IN ('result', 'error'))",
        )
        .get(runId) as { id: number | null };
      return row.id ?? 0;
    },
    /** 会話の記録を、別のチャットへ upToEventId まで写す（時刻もそのまま。分岐したチャット用。1 件ずつは知らせない） */
    copyEvents(fromRunId: number, toRunId: number, upToEventId: number): void {
      db.prepare(
        "INSERT INTO run_events (run_id, type, data, created_at) SELECT ?, type, data, created_at FROM run_events WHERE run_id = ? AND id <= ? ORDER BY id",
      ).run(toRunId, fromRunId, upToEventId);
    },
    /** 会話の記録を、fromEventId から後ろ（fromEventId を含む）すべて消す（巻き戻し用。全文検索の索引はトリガーで追従する） */
    deleteEventsFrom(runId: number, fromEventId: number): void {
      db.prepare("DELETE FROM run_events WHERE run_id = ? AND id >= ?").run(runId, fromEventId);
      const run = get(runId);
      if (run) onChange({ type: "run_events_deleted", project_id: run.project_id, run_id: runId, from_event_id: fromEventId });
    },
    listEvents(runId: number): RunEvent[] {
      const rows = db.prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY id ASC").all(runId) as unknown as EventRow[];
      return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
    },
    /** チャットのやり取り（自分の発言と AI の返答）をキーワードで検索する（部分一致・大文字と小文字を区別しない）。新しい順 */
    searchEvents(query: string, filter: { projectId?: number; runId?: number; limit?: number } = {}): SearchHit[] {
      const keyword = query.trim();
      if (!keyword) return [];
      const { from, where, params } = keywordMatch(keyword);
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
          `SELECT e.id AS event_id, e.run_id, r.project_id, r.title AS run_title, e.type, e.text, e.created_at
           FROM ${from} JOIN runs r ON r.id = e.run_id
           WHERE ${where.join(" AND ")}
           ORDER BY e.id DESC LIMIT ${Math.min(filter.limit ?? 50, 200)}`,
        )
        .all(params) as (Omit<SearchHit, "snippet" | "match_start" | "match_end"> & { text: string })[];
      return rows.map(({ text, ...row }) => ({ ...row, ...snippetAround(text, keyword) }));
    },
  };
}
