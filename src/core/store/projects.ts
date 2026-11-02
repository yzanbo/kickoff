import type { DatabaseSync } from "node:sqlite";
import { pickProjectHue } from "../projectColors.js";
import { PHASES, TASK_STATUSES, type NewProject, type Phase, type Project, type ProjectSummary, type TaskStatus } from "../types.js";
import { parseJson, updateRow, type Notify, type Row } from "./common.js";

/** プロジェクトの変えられる項目 */
export type ProjectPatch = Partial<Omit<NewProject, "auto_commit">> & {
  auto_commit?: boolean;
  write_scopes?: Project["write_scopes"];
  defaults?: Project["defaults"];
  references?: Project["references"];
  pinned?: boolean;
  archived_at?: string | null;
  hue?: number;
};

const PROJECT_COLUMNS = [
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
  "pinned",
  "archived_at",
  "hue",
] as const;

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

/** プロジェクト（projects 表。色・並び順・固定・アーカイブもここ） */
export function createProjectStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Project | undefined => {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return row ? toProject(row) : undefined;
  };
  return {
    get,
    /** 色のないプロジェクト（色を覚える前に作ったもの）に、作った順に、ほかと被らない色を割り振る（起動時） */
    assignMissingHues() {
      const rows = db.prepare("SELECT id, hue FROM projects ORDER BY id").all() as { id: number; hue: number | null }[];
      const used = rows.flatMap((r) => (r.hue === null ? [] : [r.hue]));
      for (const row of rows) {
        if (row.hue !== null) continue;
        const hue = pickProjectHue(used);
        used.push(hue);
        db.prepare("UPDATE projects SET hue = ? WHERE id = ?").run(hue, row.id);
      }
    },
    /** 一覧（更新順）。タスクの数・費用・動いているチャットの数を添える */
    list(): ProjectSummary[] {
      const projects = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map(toProject);
      const counts = db
        .prepare("SELECT project_id, phase, status, COUNT(*) AS n FROM tasks GROUP BY project_id, phase, status")
        .all() as { project_id: number; phase: Phase; status: TaskStatus; n: number }[];
      const runs = db
        .prepare(
          `SELECT project_id, SUM(cost_usd) AS cost,
             SUM(CASE WHEN status IN ('queued','running','waiting') THEN 1 ELSE 0 END) AS active
           FROM runs GROUP BY project_id`,
        )
        .all() as { project_id: number; cost: number; active: number }[];

      return projects.map((p) => {
        const task_counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
        const phase_task_counts = Object.fromEntries(PHASES.map((ph) => [ph, { total: 0, done: 0 }])) as Record<Phase, { total: number; done: number }>;
        for (const c of counts) {
          if (c.project_id !== p.id) continue;
          task_counts[c.status] += c.n;
          phase_task_counts[c.phase].total += c.n;
          if (c.status === "done") phase_task_counts[c.phase].done += c.n;
        }
        const r = runs.find((x) => x.project_id === p.id);
        return { ...p, task_counts, phase_task_counts, total_cost_usd: r?.cost ?? 0, active_runs: r?.active ?? 0 };
      });
    },
    findByPath(repoPath: string): Project | undefined {
      const row = db.prepare("SELECT * FROM projects WHERE repo_path = ?").get(repoPath);
      return row ? toProject(row) : undefined;
    },
    create(input: NewProject): Project {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO projects (name, description, repo_path, provider, test_command, deploy_instructions, auto_commit, position, hue)
           VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM projects), ?)`,
        )
        .run(
          input.name,
          input.description ?? "",
          input.repo_path,
          input.provider,
          input.test_command ?? "",
          input.deploy_instructions ?? "",
          input.auto_commit === false ? 0 : 1,
          // ほかのプロジェクト（しまったものも含む）と被らない色
          pickProjectHue((db.prepare("SELECT hue FROM projects WHERE hue IS NOT NULL").all() as { hue: number }[]).map((r) => r.hue)),
        );
      const project = get(Number(lastInsertRowid))!;
      onChange({ type: "project", project });
      return project;
    },
    update(id: number, patch: ProjectPatch): Project {
      const { references, ...rest } = patch;
      const row: Row = {
        ...rest,
        auto_commit: patch.auto_commit === undefined ? undefined : patch.auto_commit ? 1 : 0,
        pinned: patch.pinned === undefined ? undefined : patch.pinned ? 1 : 0,
        write_scopes: patch.write_scopes === undefined ? undefined : JSON.stringify(patch.write_scopes),
        defaults: patch.defaults === undefined ? undefined : JSON.stringify(patch.defaults),
        reference_paths: references === undefined ? undefined : JSON.stringify(references),
      } as Row;
      updateRow(db, "projects", id, row, PROJECT_COLUMNS);
      const project = get(id)!;
      onChange({ type: "project", project });
      return project;
    },
    /** サイドバーでのプロジェクトの並び順を ids の順にする */
    reorder(ids: number[]) {
      const stmt = db.prepare("UPDATE projects SET position = ? WHERE id = ?");
      ids.forEach((id, i) => stmt.run(i + 1, id));
      for (const id of ids) {
        const project = get(id);
        if (project) onChange({ type: "project", project });
      }
    },
    delete(id: number) {
      db.prepare("DELETE FROM projects WHERE id = ?").run(id);
      onChange({ type: "project_deleted", id });
    },
  };
}
