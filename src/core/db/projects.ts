import type { DatabaseSync } from "node:sqlite";
import { pickProjectHue } from "@shared/project/colors";
import { normalizeTags } from "@shared/project/tags";
import type { Project } from "@shared/types";
import { bit, updateRow, type Notify, type Row } from "./common.js";
import type { NewProject } from "./types.js";

/** プロジェクトの変えられる列（型と UPDATE の対象をここ 1 つで決める） */
const PROJECT_COLUMNS = ["name", "description", "repo_path", "provider", "hue", "pinned", "archived_at", "tags", "chat_defaults", "reference_paths", "memo_folder", "memo_path", "pre_compact_prompt", "post_compact_prompt", "pre_compact_enabled", "post_compact_enabled", "github_account", "github_remote", "pr_watch", "ci_watch"] as const satisfies readonly (keyof Project)[];

/** プロジェクトの変えられる項目 */
export type ProjectPatch = Partial<Pick<Project, (typeof PROJECT_COLUMNS)[number]>>;

/** DB の行（JSON の列は文字列、真偽値は 0 / 1） */
type ProjectRow = Omit<Project, "pinned" | "tags" | "chat_defaults" | "reference_paths" | "pre_compact_enabled" | "post_compact_enabled" | "pr_watch" | "ci_watch"> & {
  pinned: number;
  pr_watch: number;
  ci_watch: number;
  pre_compact_enabled: number;
  post_compact_enabled: number;
  tags: string;
  chat_defaults: string;
  reference_paths: string;
};

/** DB の行をアプリの型にする（JSON の列の形は CHECK で守ってある） */
function toProject(row: unknown): Project {
  const r = row as ProjectRow;
  return {
    ...r,
    pinned: r.pinned === 1,
    pre_compact_enabled: r.pre_compact_enabled === 1,
    post_compact_enabled: r.post_compact_enabled === 1,
    pr_watch: r.pr_watch === 1,
    ci_watch: r.ci_watch === 1,
    tags: JSON.parse(r.tags),
    chat_defaults: JSON.parse(r.chat_defaults),
    reference_paths: JSON.parse(r.reference_paths),
  };
}

/** 変える項目を DB の列の値にする */
function toProjectRow({ pinned, pre_compact_enabled, post_compact_enabled, pr_watch, ci_watch, tags, chat_defaults, reference_paths, ...rest }: ProjectPatch): Row {
  return {
    ...rest,
    pinned: bit(pinned),
    pre_compact_enabled: bit(pre_compact_enabled),
    post_compact_enabled: bit(post_compact_enabled),
    pr_watch: bit(pr_watch),
    ci_watch: bit(ci_watch),
    tags: tags === undefined ? undefined : JSON.stringify(normalizeTags(tags)),
    chat_defaults: chat_defaults === undefined ? undefined : JSON.stringify(chat_defaults),
    reference_paths: reference_paths === undefined ? undefined : JSON.stringify(reference_paths),
  } as Row;
}

/** プロジェクト（projects の表。色・並び順・固定・アーカイブもここ） */
export function createProjectStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Project | undefined => {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return row ? toProject(row) : undefined;
  };
  const list = (): Project[] => db.prepare("SELECT * FROM projects ORDER BY position, id").all().map(toProject);
  return {
    get,
    /** すべて（サイドバーの並び順） */
    list,
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
      updateRow(db, "projects", id, toProjectRow(patch), PROJECT_COLUMNS);
      const project = get(id)!;
      onChange({ type: "project", project });
      return project;
    },
    /** サイドバーでのプロジェクトの並び順を ids の順にする（並べたあとの一覧を返す） */
    reorder(ids: number[]): Project[] {
      const stmt = db.prepare("UPDATE projects SET position = ? WHERE id = ?");
      ids.forEach((id, i) => stmt.run(i + 1, id));
      for (const id of ids) {
        const project = get(id);
        if (project) onChange({ type: "project", project });
      }
      return list();
    },
    delete(id: number) {
      db.prepare("DELETE FROM projects WHERE id = ?").run(id);
      onChange({ type: "project_deleted", id });
    },
  };
}
