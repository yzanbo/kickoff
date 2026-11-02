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
  type RunGroup,
  type RunEventData,
  type RunStatus,
  type SearchHit,
  type Task,
  type TaskStatus,
} from "./types.js";
import { migrate, NOW } from "./schema.js";

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

/** DB の行（write_scopes・defaults は JSON 文字列）をアプリの型に変換する */
function toProject(row: unknown): Project {
  const { reference_paths, ...r } = row as Omit<Project, "write_scopes" | "defaults" | "references"> & {
    write_scopes: string;
    defaults: string;
    reference_paths?: string;
  };
  const references = parseJson<Project["references"]>(reference_paths || "[]");
  // 以前の「新しいチャットを置くカンバンの列」（stage）は、列が AI の状態で決まるようになったので読まない
  const { stage: _legacyStage, ...defaults } = parseJson<Project["defaults"] & { stage?: unknown }>(r.defaults);
  return { ...r, write_scopes: parseJson(r.write_scopes), defaults, references: Array.isArray(references) ? references : [] };
}

/** 壊れた値は空（既定）に戻す */
function parseJson<T extends object>(text: string | null | undefined): T {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" ? value : ({} as T);
  } catch {
    return {} as T;
  }
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
  group_id?: number | null;
  /** 作業場所（ワークツリーのフォルダ。省略・空なら本体） */
  worktree_path?: string;
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
    migrate(this.db);
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
        `INSERT INTO projects (name, description, repo_path, provider, test_command, deploy_instructions, auto_commit, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM projects))`,
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
    patch: Partial<Omit<NewProject, "auto_commit">> & {
      auto_commit?: boolean;
      write_scopes?: Project["write_scopes"];
      defaults?: Project["defaults"];
      references?: Project["references"];
    },
  ): Project {
    const { references, ...rest } = patch;
    const row: Row = {
      ...rest,
      auto_commit: patch.auto_commit === undefined ? undefined : patch.auto_commit ? 1 : 0,
      write_scopes: patch.write_scopes === undefined ? undefined : JSON.stringify(patch.write_scopes),
      defaults: patch.defaults === undefined ? undefined : JSON.stringify(patch.defaults),
      reference_paths: references === undefined ? undefined : JSON.stringify(references),
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
      "defaults",
      "reference_paths",
    ]);
    const project = this.getProject(id)!;
    this.onChange({ type: "project", project });
    return project;
  }

  /** タスクや実行の更新時にプロジェクトの更新日時を進める（一覧の並び順用） */
  private touchProject(id: number) {
    this.db.prepare(`UPDATE projects SET updated_at = ${NOW} WHERE id = ?`).run(id);
  }

  /** サイドバーでのプロジェクトの並び順を ids の順にする */
  reorderProjects(ids: number[]) {
    const stmt = this.db.prepare("UPDATE projects SET position = ? WHERE id = ?");
    ids.forEach((id, i) => stmt.run(i + 1, id));
    for (const id of ids) {
      const project = this.getProject(id);
      if (project) this.onChange({ type: "project", project });
    }
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

  listRuns(
    filter: { projectId?: number; taskId?: number; statuses?: RunStatus[]; limit?: number; includeArchived?: boolean } = {},
  ): Run[] {
    const where: string[] = filter.includeArchived ? [] : ["archived_at IS NULL"];
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

  /** チャットを完全に削除する（会話の記録も消える） */
  deleteRun(id: number) {
    const run = this.getRun(id);
    if (!run) return;
    this.db.prepare("DELETE FROM runs WHERE id = ?").run(id);
    this.onChange({ type: "run_deleted", id, project_id: run.project_id });
  }

  /** チャットをグループへ移す（null でグループから外す）。並び順が変わらないよう更新日時は進めない */
  /** 確認待ち（未読）の印を付ける・外す。最後に動いた時刻（一覧の並び順）は変えない */
  setRunAttention(id: number, attention: boolean): Run {
    this.db.prepare("UPDATE runs SET attention = ? WHERE id = ?").run(attention ? 1 : 0, id);
    const run = this.getRun(id)!;
    this.onChange({ type: "run", run });
    return run;
  }

  /** その作業場所（ワークツリー）を使っているチャット */
  runsInWorktree(projectId: number, worktreePath: string): Run[] {
    return (this.db.prepare("SELECT * FROM runs WHERE project_id = ? AND worktree_path = ?").all(projectId, worktreePath) as unknown as Run[]).map((r) => this.getRun(r.id)!);
  }

  /** ワークツリーを片付けたあと、そこで作業していたチャットの作業場所を本体に戻す（並び順は変えない） */
  clearRunWorktree(projectId: number, worktreePath: string): void {
    const runs = this.runsInWorktree(projectId, worktreePath);
    this.db.prepare("UPDATE runs SET worktree_path = '' WHERE project_id = ? AND worktree_path = ?").run(projectId, worktreePath);
    for (const run of runs) this.onChange({ type: "run", run: this.getRun(run.id)! });
  }

  setRunGroup(id: number, groupId: number | null): Run {
    this.db.prepare("UPDATE runs SET group_id = ? WHERE id = ?").run(groupId, id);
    const run = this.getRun(id)!;
    this.onChange({ type: "run", run });
    return run;
  }

  // ---- チャットのグループ ----

  listGroups(projectId: number): RunGroup[] {
    return this.db.prepare("SELECT * FROM run_groups WHERE project_id = ? ORDER BY position, id").all(projectId) as unknown as RunGroup[];
  }

  getGroup(id: number): RunGroup | undefined {
    return this.db.prepare("SELECT * FROM run_groups WHERE id = ?").get(id) as unknown as RunGroup | undefined;
  }

  createGroup(projectId: number, name: string): RunGroup {
    const { next } = this.db
      .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM run_groups WHERE project_id = ?")
      .get(projectId) as { next: number };
    const { lastInsertRowid } = this.db
      .prepare("INSERT INTO run_groups (project_id, name, position) VALUES (?, ?, ?)")
      .run(projectId, name, next);
    const group = this.getGroup(Number(lastInsertRowid))!;
    this.onChange({ type: "group", group });
    return group;
  }

  renameGroup(id: number, name: string): RunGroup {
    this.updateRow("run_groups", id, { name }, ["name"]);
    const group = this.getGroup(id)!;
    this.onChange({ type: "group", group });
    return group;
  }

  /** ids の順に並べ直す（ほかのプロジェクトのグループは無視する） */
  reorderGroups(projectId: number, ids: number[]): RunGroup[] {
    const stmt = this.db.prepare("UPDATE run_groups SET position = ? WHERE id = ? AND project_id = ?");
    ids.forEach((id, i) => stmt.run(i, id, projectId));
    const groups = this.listGroups(projectId);
    for (const group of groups) this.onChange({ type: "group", group });
    return groups;
  }

  /** グループを消す。中のチャットは消さず、グループなしに戻す */
  deleteGroup(id: number) {
    const group = this.getGroup(id);
    if (!group) return;
    const members = this.db.prepare("SELECT id FROM runs WHERE group_id = ?").all(id) as { id: number }[];
    this.db.prepare("DELETE FROM run_groups WHERE id = ?").run(id);
    for (const { id: runId } of members) this.onChange({ type: "run", run: this.getRun(runId)! });
    this.onChange({ type: "group_deleted", id, project_id: group.project_id });
  }

  getRun(id: number): Run | undefined {
    return this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as unknown as Run | undefined;
  }

  createRun(input: NewRun): Run {
    const { lastInsertRowid } = this.db
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
        input.permission_mode ?? "phase",
        input.fast_mode ? 1 : 0,
        input.group_id ?? null,
        input.worktree_path ?? "",
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
      >
    >,
  ): Run {
    this.updateRow("runs", id, patch as Row, [
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
    const stale = this.listRuns({ statuses: ["queued", "running", "waiting"], limit: 1000, includeArchived: true });
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
