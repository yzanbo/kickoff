import type { DatabaseSync } from "node:sqlite";
import type { Artifact, ArtifactKind, NewArtifact } from "../types.js";
import { touchProject, type Notify } from "./common.js";

/** 成果物（要件定義書・テストレポートなど。エージェントが save_artifact で保存する） */
export function createArtifactStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Artifact | undefined => db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as unknown as Artifact | undefined;
  return {
    get,
    list(projectId: number, filter: { kind?: ArtifactKind } = {}): Artifact[] {
      if (filter.kind) {
        return db.prepare("SELECT * FROM artifacts WHERE project_id = ? AND kind = ? ORDER BY id DESC").all(projectId, filter.kind) as unknown as Artifact[];
      }
      return db.prepare("SELECT * FROM artifacts WHERE project_id = ? ORDER BY id DESC").all(projectId) as unknown as Artifact[];
    },
    create(input: NewArtifact): Artifact {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO artifacts (project_id, phase, kind, title, content, file_path, run_id, task_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(input.project_id, input.phase, input.kind, input.title, input.content, input.file_path ?? "", input.run_id ?? null, input.task_id ?? null);
      const artifact = get(Number(lastInsertRowid))!;
      touchProject(db, artifact.project_id);
      onChange({ type: "artifact", artifact });
      return artifact;
    },
  };
}
