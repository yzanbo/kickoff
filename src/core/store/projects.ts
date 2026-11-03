import type { DatabaseSync } from "node:sqlite";
import { legacyProjectDefaults } from "../legacyValues.js";
import { pickProjectHue } from "../projectColors.js";
import type { NewProject, Project, ProjectSummary } from "../types.js";
import { parseJson, updateRow, type Notify, type Row } from "./common.js";

/** プロジェクトの変えられる項目 */
export type ProjectPatch = Partial<NewProject> & {
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
  "defaults",
  "reference_paths",
  "pinned",
  "archived_at",
  "hue",
] as const;

/** DB の行（defaults・reference_paths は JSON 文字列）をアプリの型に変換する */
function toProject(row: unknown): Project {
  const { reference_paths, defaults, active_at, ...r } = row as Omit<Project, "defaults" | "references" | "updated_at"> & {
    defaults: string;
    reference_paths: string;
    active_at: string;
  };
  const references = parseJson<Project["references"]>(reference_paths || "[]");
  return {
    ...r,
    updated_at: active_at,
    defaults: legacyProjectDefaults(parseJson(defaults)),
    references: Array.isArray(references) ? references : [],
  };
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
    /** 一覧（更新順）。費用・動いているチャットの数を添える */
    list(): ProjectSummary[] {
      const projects = db.prepare("SELECT * FROM projects ORDER BY active_at DESC").all().map(toProject);
      const runs = db
        .prepare(
          `SELECT project_id, SUM(cost_usd) AS cost,
             SUM(CASE WHEN status IN ('queued','running','waiting') THEN 1 ELSE 0 END) AS active
           FROM runs GROUP BY project_id`,
        )
        .all() as { project_id: number; cost: number; active: number }[];

      return projects.map((p) => {
        const r = runs.find((x) => x.project_id === p.id);
        return { ...p, total_cost_usd: r?.cost ?? 0, active_runs: r?.active ?? 0 };
      });
    },
    findByPath(repoPath: string): Project | undefined {
      const row = db.prepare("SELECT * FROM projects WHERE repo_path = ?").get(repoPath);
      return row ? toProject(row) : undefined;
    },
    create(input: NewProject): Project {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO projects (name, description, repo_path, provider, position, hue)
           VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM projects), ?)`,
        )
        .run(
          input.name,
          input.description ?? "",
          input.repo_path,
          input.provider,
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
        pinned: patch.pinned === undefined ? undefined : patch.pinned ? 1 : 0,
        defaults: patch.defaults === undefined ? undefined : JSON.stringify(patch.defaults),
        reference_paths: references === undefined ? undefined : JSON.stringify(references),
      } as Row;
      updateRow(db, "projects", id, row, PROJECT_COLUMNS, true);
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
