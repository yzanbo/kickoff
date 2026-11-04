import type { DatabaseSync } from "node:sqlite";
import type { Run, RunGroup } from "../types.js";
import { pickProjectHue } from "../projectColors.js";
import { updateRow, type Notify } from "./common.js";

/** チャットを自分でまとめるグループ（プロジェクトごと）。getRun は、消したグループの中のチャットの変更を知らせるのに使う */
export function createGroupStore(db: DatabaseSync, onChange: Notify, getRun: (id: number) => Run | undefined) {
  const get = (id: number): RunGroup | undefined => db.prepare("SELECT * FROM run_groups WHERE id = ?").get(id) as unknown as RunGroup | undefined;
  const list = (projectId: number): RunGroup[] =>
    db.prepare("SELECT * FROM run_groups WHERE project_id = ? ORDER BY position, id").all(projectId) as unknown as RunGroup[];
  /** そのプロジェクトのほかのグループと被らない色（プロジェクトの色と同じ選び方: いちばん使われていない色、同じならいちばん離れた色） */
  const freeHue = (projectId: number) =>
    pickProjectHue((db.prepare("SELECT hue FROM run_groups WHERE project_id = ? AND hue IS NOT NULL").all(projectId) as { hue: number }[]).map((r) => r.hue));
  /** 色のないグループ（v4 で色を足す前に作ったもの）に、プロジェクトごとに並び順で被らない色を付ける（開いたときに 1 回） */
  const assignMissingHues = () => {
    const missing = db.prepare("SELECT id, project_id FROM run_groups WHERE hue IS NULL ORDER BY project_id, position, id").all() as { id: number; project_id: number }[];
    const set = db.prepare("UPDATE run_groups SET hue = ? WHERE id = ?");
    for (const g of missing) set.run(freeHue(g.project_id), g.id);
  };
  assignMissingHues();
  return {
    get,
    list,
    create(projectId: number, name: string): RunGroup {
      const { next } = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM run_groups WHERE project_id = ?").get(projectId) as { next: number };
      const { lastInsertRowid } = db
        .prepare("INSERT INTO run_groups (project_id, name, position, hue) VALUES (?, ?, ?, ?)")
        .run(projectId, name, next, freeHue(projectId));
      const group = get(Number(lastInsertRowid))!;
      onChange({ type: "group", group });
      return group;
    },
    rename(id: number, name: string): RunGroup {
      updateRow(db, "run_groups", id, { name }, ["name"], false);
      const group = get(id)!;
      onChange({ type: "group", group });
      return group;
    },
    /** ids の順に並べ直す（ほかのプロジェクトのグループは無視する） */
    reorder(projectId: number, ids: number[]): RunGroup[] {
      const stmt = db.prepare("UPDATE run_groups SET position = ? WHERE id = ? AND project_id = ?");
      ids.forEach((id, i) => stmt.run(i, id, projectId));
      const groups = list(projectId);
      for (const group of groups) onChange({ type: "group", group });
      return groups;
    },
    /** グループを消す。中のチャットは消さず、グループなしに戻す */
    delete(id: number) {
      const group = get(id);
      if (!group) return;
      const members = db.prepare("SELECT id FROM runs WHERE group_id = ?").all(id) as { id: number }[];
      db.prepare("DELETE FROM run_groups WHERE id = ?").run(id);
      for (const { id: runId } of members) onChange({ type: "run", run: getRun(runId)! });
      onChange({ type: "group_deleted", id, project_id: group.project_id });
    },
  };
}
