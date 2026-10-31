import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  DEFAULT_SETTINGS,
  PHASES,
  TASK_STATUSES,
  type AppSettings,
  type Artifact,
  type ArtifactKind,
  type BusEvent,
  type EffortLevel,
  type PermissionChoice,
  type Phase,
  type Project,
  type ProjectSummary,
  type ProviderId,
  type Run,
  type RunEvent,
  type RunEventData,
  type RunStatus,
  type SearchHit,
  type Task,
  type TaskStatus,
} from "./types.js";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  repo_path TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'claude',
  current_phase TEXT NOT NULL DEFAULT 'requirements',
  test_command TEXT NOT NULL DEFAULT '',
  deploy_instructions TEXT NOT NULL DEFAULT '',
  auto_commit INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority INTEGER NOT NULL DEFAULT 2,
  summary TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  worktree_path TEXT NOT NULL DEFAULT '',
  pr_url TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, phase);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  phase TEXT NOT NULL,
  provider TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  session_id TEXT,
  model TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  num_turns INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id);
CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id);
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
`;

/** MIGRATIONS[n] でバージョン n → n+1 に上げる */
const MIGRATIONS = [
  SCHEMA,
  // v2: 要件定義書の確定（1 段目のゲート）
  "ALTER TABLE projects ADD COLUMN requirements_confirmed_at TEXT",
  // v3: チャット欄で選ぶ推論の深さと権限モード
  `ALTER TABLE runs ADD COLUMN effort TEXT;
   ALTER TABLE runs ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'phase';`,
  // v4: セクションごとの書き込みできるフォルダ（JSON）
  "ALTER TABLE projects ADD COLUMN write_scopes TEXT NOT NULL DEFAULT '{}'",
  // v5: ファストモード
  "ALTER TABLE runs ADD COLUMN fast_mode INTEGER NOT NULL DEFAULT 0",
];

type Row = Record<string, SQLInputValue>;

/** キーワードの前後を切り出す（前 40 文字・後ろ 80 文字程度） */
export function snippetAround(text: string, keyword: string): { snippet: string; match_start: number; match_end: number } {
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

/** DB の行（write_scopes は JSON 文字列）をアプリの型に変換する */
function toProject(row: unknown): Project {
  const r = row as Omit<Project, "write_scopes"> & { write_scopes: string };
  let write_scopes: Project["write_scopes"] = {};
  try {
    write_scopes = JSON.parse(r.write_scopes || "{}");
  } catch {
    // 壊れた値は既定に戻す
  }
  return { ...r, write_scopes };
}

export interface NewProject {
  name: string;
  description?: string;
  repo_path: string;
  provider: ProviderId;
  test_command?: string;
  deploy_instructions?: string;
  auto_commit?: boolean;
}

export interface NewTask {
  project_id: number;
  phase: Phase;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  priority?: number;
  status?: TaskStatus;
  created_by?: "user" | "agent";
}

export interface NewRun {
  project_id: number;
  task_id: number | null;
  phase: Phase;
  provider: ProviderId;
  title: string;
  status: RunStatus;
  model: string | null;
  effort?: EffortLevel | null;
  permission_mode?: PermissionChoice;
  fast_mode?: boolean;
}

export interface NewArtifact {
  project_id: number;
  phase: Phase;
  kind: ArtifactKind;
  title: string;
  content: string;
  file_path?: string;
  run_id?: number | null;
  task_id?: number | null;
}

/**
 * SQLite の永続化層。変更系メソッドは onChange でイベントを通知する
 * （UI やモバイルへのリアルタイム配信はこの通知を起点にする）
 */
export class Store {
  readonly db: DatabaseSync;

  constructor(
    file: string,
    private readonly onChange: (e: BusEvent) => void = () => {},
  ) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  /** スキーマのバージョン管理。変更は MIGRATIONS に追記していく */
  private migrate() {
    const { user_version } = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    for (let v = user_version; v < MIGRATIONS.length; v++) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(MIGRATIONS[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
  }

  close() {
    this.db.close();
  }

  // ---- 設定 ----

  getSettings(): AppSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const stmt = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) stmt.run(key, JSON.stringify(value));
    }
    const settings = this.getSettings();
    this.onChange({ type: "settings", settings });
    return settings;
  }

  // ---- プロジェクト ----

  listProjects(): ProjectSummary[] {
    const projects = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map(toProject);
    const counts = this.db
      .prepare("SELECT project_id, phase, status, COUNT(*) AS n FROM tasks GROUP BY project_id, phase, status")
      .all() as { project_id: number; phase: Phase; status: TaskStatus; n: number }[];
    const runs = this.db
      .prepare(
        `SELECT project_id, SUM(cost_usd) AS cost,
           SUM(CASE WHEN status IN ('queued','running','waiting') THEN 1 ELSE 0 END) AS active
         FROM runs GROUP BY project_id`,
      )
      .all() as { project_id: number; cost: number; active: number }[];

    return projects.map((p) => {
      const task_counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
      const phase_task_counts = Object.fromEntries(PHASES.map((ph) => [ph, { total: 0, done: 0 }])) as Record<
        Phase,
        { total: number; done: number }
      >;
      for (const c of counts) {
        if (c.project_id !== p.id) continue;
        task_counts[c.status] += c.n;
        phase_task_counts[c.phase].total += c.n;
        if (c.status === "done") phase_task_counts[c.phase].done += c.n;
      }
      const r = runs.find((x) => x.project_id === p.id);
      return { ...p, task_counts, phase_task_counts, total_cost_usd: r?.cost ?? 0, active_runs: r?.active ?? 0 };
    });
  }

  findProjectByPath(repoPath: string): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE repo_path = ?").get(repoPath);
    return row ? toProject(row) : undefined;
  }

  getProject(id: number): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return row ? toProject(row) : undefined;
  }

  createProject(input: NewProject): Project {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO projects (name, description, repo_path, provider, test_command, deploy_instructions, auto_commit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.description ?? "",
        input.repo_path,
        input.provider,
        input.test_command ?? "",
        input.deploy_instructions ?? "",
        input.auto_commit === false ? 0 : 1,
      );
    const project = this.getProject(Number(lastInsertRowid))!;
    this.onChange({ type: "project", project });
    return project;
  }

  updateProject(
    id: number,
    patch: Partial<Omit<NewProject, "auto_commit">> & { auto_commit?: boolean; write_scopes?: Project["write_scopes"] },
  ): Project {
    const row: Row = {
      ...patch,
      auto_commit: patch.auto_commit === undefined ? undefined : patch.auto_commit ? 1 : 0,
      write_scopes: patch.write_scopes === undefined ? undefined : JSON.stringify(patch.write_scopes),
    } as Row;
    this.updateRow("projects", id, row, [
      "name",
      "description",
      "repo_path",
      "provider",
      "test_command",
      "deploy_instructions",
      "auto_commit",
      "write_scopes",
    ]);
    const project = this.getProject(id)!;
    this.onChange({ type: "project", project });
    return project;
  }

  /** タスクや実行の更新時にプロジェクトの更新日時を進める（一覧の並び順用） */
  private touchProject(id: number) {
    this.db.prepare(`UPDATE projects SET updated_at = ${NOW} WHERE id = ?`).run(id);
  }

  deleteProject(id: number) {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    this.onChange({ type: "project_deleted", id });
  }

  // ---- タスク ----

  listTasks(projectId: number, filter: { phase?: Phase; status?: TaskStatus } = {}): Task[] {
    const where = ["project_id = $project_id"];
    const params: Row = { project_id: projectId };
    if (filter.phase) {
      where.push("phase = $phase");
      params.phase = filter.phase;
    }
    if (filter.status) {
      where.push("status = $status");
      params.status = filter.status;
    }
    return this.db
      .prepare(`SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY priority ASC, id ASC`)
      .all(params) as unknown as Task[];
  }

  getTask(id: number): Task | undefined {
    return this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as Task | undefined;
  }

  createTask(input: NewTask): Task {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO tasks (project_id, phase, title, description, acceptance_criteria, priority, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.project_id,
        input.phase,
        input.title,
        input.description ?? "",
        input.acceptance_criteria ?? "",
        input.priority ?? 2,
        input.status ?? "todo",
        input.created_by ?? "user",
      );
    const task = this.getTask(Number(lastInsertRowid))!;
    this.touchProject(task.project_id);
    this.onChange({ type: "task", task });
    return task;
  }

  updateTask(
    id: number,
    patch: Partial<
      Pick<
        Task,
        "phase" | "title" | "description" | "acceptance_criteria" | "status" | "priority" | "summary" | "branch" | "worktree_path" | "pr_url"
      >
    >,
  ): Task {
    this.updateRow("tasks", id, patch as Row, [
      "phase",
      "title",
      "description",
      "acceptance_criteria",
      "status",
      "priority",
      "summary",
      "branch",
      "worktree_path",
      "pr_url",
    ]);
    const task = this.getTask(id)!;
    this.touchProject(task.project_id);
    this.onChange({ type: "task", task });
    return task;
  }

  deleteTask(id: number) {
    const task = this.getTask(id);
    if (!task) return;
    this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    this.onChange({ type: "task_deleted", id, project_id: task.project_id });
  }

  // ---- 実行（エージェントとの会話セッション） ----

  listRuns(filter: { projectId?: number; taskId?: number; statuses?: RunStatus[]; limit?: number } = {}): Run[] {
    const where: string[] = [];
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
    return this.db.prepare(sql).all(params) as unknown as Run[];
  }

  getRun(id: number): Run | undefined {
    return this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as unknown as Run | undefined;
  }

  createRun(input: NewRun): Run {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO runs (project_id, task_id, phase, provider, title, status, model, effort, permission_mode, fast_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.permission_mode ?? "phase",
        input.fast_mode ? 1 : 0,
      );
    const run = this.getRun(Number(lastInsertRowid))!;
    this.touchProject(run.project_id);
    this.onChange({ type: "run", run });
    return run;
  }

  updateRun(
    id: number,
    patch: Partial<
      Pick<
        Run,
        "title" | "status" | "session_id" | "model" | "effort" | "permission_mode" | "fast_mode" | "cost_usd" | "num_turns" | "result" | "error"
      >
    >,
  ): Run {
    this.updateRow("runs", id, patch as Row, [
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
    ]);
    const run = this.getRun(id)!;
    this.onChange({ type: "run", run });
    return run;
  }

  addEvent(runId: number, event: RunEventData): RunEvent {
    const { type, ...data } = event;
    const { lastInsertRowid } = this.db
      .prepare("INSERT INTO run_events (run_id, type, data) VALUES (?, ?, ?)")
      .run(runId, type, JSON.stringify(data));
    const row = this.db.prepare("SELECT * FROM run_events WHERE id = ?").get(Number(lastInsertRowid)) as {
      id: number;
      run_id: number;
      type: RunEvent["type"];
      data: string;
      created_at: string;
    };
    const saved: RunEvent = { ...row, data: JSON.parse(row.data) };
    const run = this.getRun(runId);
    if (run) this.onChange({ type: "run_event", project_id: run.project_id, event: saved });
    return saved;
  }

  listEvents(runId: number): RunEvent[] {
    const rows = this.db.prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY id ASC").all(runId) as {
      id: number;
      run_id: number;
      type: RunEvent["type"];
      data: string;
      created_at: string;
    }[];
    return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
  }

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
    const rows = this.db
      .prepare(
        `SELECT e.id AS event_id, e.run_id, r.project_id, r.title AS run_title, r.phase, e.type,
                json_extract(e.data, '$.text') AS text, e.created_at
         FROM run_events e JOIN runs r ON r.id = e.run_id
         WHERE ${where.join(" AND ")}
         ORDER BY e.id DESC LIMIT ${Math.min(filter.limit ?? 50, 200)}`,
      )
      .all(params) as (Omit<SearchHit, "snippet" | "match_start" | "match_end"> & { text: string })[];
    return rows.map(({ text, ...row }) => ({ ...row, ...snippetAround(text, keyword) }));
  }

  /** 起動時の復旧: 前回終了時に動いていた実行を中断扱いにする */
  recoverInterruptedRuns(): number {
    const stale = this.listRuns({ statuses: ["queued", "running", "waiting"], limit: 1000 });
    for (const run of stale) {
      this.updateRun(run.id, {
        status: "failed",
        error: "アプリの終了により中断しました。メッセージを送ると続きから再開できます。",
      });
      if (run.task_id) {
        const task = this.getTask(run.task_id);
        if (task?.status === "in_progress") this.updateTask(task.id, { status: "todo" });
      }
    }
    return stale.length;
  }

  // ---- 成果物 ----

  listArtifacts(projectId: number, filter: { kind?: ArtifactKind } = {}): Artifact[] {
    if (filter.kind) {
      return this.db
        .prepare("SELECT * FROM artifacts WHERE project_id = ? AND kind = ? ORDER BY id DESC")
        .all(projectId, filter.kind) as unknown as Artifact[];
    }
    return this.db
      .prepare("SELECT * FROM artifacts WHERE project_id = ? ORDER BY id DESC")
      .all(projectId) as unknown as Artifact[];
  }

  getArtifact(id: number): Artifact | undefined {
    return this.db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as unknown as Artifact | undefined;
  }

  createArtifact(input: NewArtifact): Artifact {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO artifacts (project_id, phase, kind, title, content, file_path, run_id, task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.project_id,
        input.phase,
        input.kind,
        input.title,
        input.content,
        input.file_path ?? "",
        input.run_id ?? null,
        input.task_id ?? null,
      );
    const artifact = this.getArtifact(Number(lastInsertRowid))!;
    this.touchProject(artifact.project_id);
    this.onChange({ type: "artifact", artifact });
    return artifact;
  }

  // ---- 内部ヘルパー ----

  private updateRow(table: string, id: number, patch: Row, allowed: readonly string[]) {
    const keys = Object.keys(patch).filter((k) => allowed.includes(k) && patch[k] !== undefined);
    if (keys.length === 0) return;
    const sets = keys.map((k) => `${k} = $${k}`).join(", ");
    const params: Row = { id };
    for (const k of keys) params[k] = patch[k];
    this.db.prepare(`UPDATE ${table} SET ${sets}, updated_at = ${NOW} WHERE id = $id`).run(params);
  }
}
