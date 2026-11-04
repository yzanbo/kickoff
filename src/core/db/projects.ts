import type { DatabaseSync } from "node:sqlite";
import { pickProjectHue } from "@shared/project/colors";
import { normalizeTags } from "@shared/project/tags";
import type { NewProject, Project, ProjectSummary } from "@shared/types";
import { bit, parseJson, updateRow, type Notify, type Row } from "./common.js";

/** プロジェクトの変えられる項目 */
export type ProjectPatch = Partial<NewProject> & {
  defaults?: Project["defaults"];
  references?: Project["references"];
  tags?: string[];
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
  "tags",
] as const;

/** DB の行（defaults・reference_paths・tags は JSON 文字列、pinned は 0 / 1）をアプリの型に変換する */
function toProject(row: unknown): Project {
  const { reference_paths, defaults, pinned, tags, ...r } = row as Omit<Project, "defaults" | "references" | "pinned" | "tags"> & {
    defaults: string;
    reference_paths: string;
    pinned: number;
    tags: string;
  };
  const references = parseJson<Project["references"]>(reference_paths);
  const tagList = parseJson<unknown[]>(tags);
  return {
    ...r,
    pinned: pinned === 1,
    defaults: parseJson(defaults),
    references: Array.isArray(references) ? references : [],
    // 壊れた値・文字でない要素は捨てる
    tags: Array.isArray(tagList) ? normalizeTags(tagList.filter((t): t is string => typeof t === "string")) : [],
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
    /** 一覧（更新順）。費用・動いているチャットの数を添える */
    list(): ProjectSummary[] {
      const projects = db.prepare("SELECT * FROM projects ORDER BY active_at DESC").all().map(toProject);
      const chats = db
        .prepare(
          `SELECT project_id, SUM(cost_usd) AS cost,
             SUM(CASE WHEN status IN ('queued','running','waiting') THEN 1 ELSE 0 END) AS active
           FROM chats GROUP BY project_id`,
        )
        .all() as { project_id: number; cost: number; active: number }[];

      return projects.map((p) => {
        const r = chats.find((x) => x.project_id === p.id);
        return { ...p, total_cost_usd: r?.cost ?? 0, active_chats: r?.active ?? 0 };
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
          pickProjectHue((db.prepare("SELECT hue FROM projects").all() as { hue: number }[]).map((r) => r.hue)),
        );
      const project = get(Number(lastInsertRowid))!;
      onChange({ type: "project", project });
      return project;
    },
    update(id: number, patch: ProjectPatch): Project {
      const { references, tags, ...rest } = patch;
      const row: Row = {
        ...rest,
        pinned: bit(patch.pinned),
        defaults: patch.defaults === undefined ? undefined : JSON.stringify(patch.defaults),
        reference_paths: references === undefined ? undefined : JSON.stringify(references),
        tags: tags === undefined ? undefined : JSON.stringify(normalizeTags(tags)),
      } as Row;
      // 名前・色・タグ・固定・アーカイブなどの編集は「動いた」ではないので、最後に動いた時刻（active_at）は進めない（進めるのはチャットの動き: touchProject）
      updateRow(db, "projects", id, row, PROJECT_COLUMNS, false);
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
