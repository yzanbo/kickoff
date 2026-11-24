import type { DatabaseSync } from "node:sqlite";
import type { Notify } from "@/foundation/core/db/common";
import { pickProjectHue } from "@shared/projects/colors";
import { normalizeTags } from "@shared/projects/tags";
import type { Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import { projectsTable } from "@/features/projects/core/schema";

/** 作るときの入力（ほかの項目は表の既定） */
export interface NewProject {
  name: string;
  description?: string | null;
  repo_path: string;
  provider: ProviderId;
}

/** プロジェクトの変えられる項目（番号・並び・作った時刻は変えない。並びは reorder） */
export type ProjectPatch = Partial<Omit<Project, "id" | "position" | "created_at">>;

export type ProjectStore = ReturnType<typeof createProjectStore>;

/**
 * プロジェクト（projects の表。色・並び順・固定・アーカイブもここ）。Kickoff のゴミ箱に入れたプロジェクト（trashed_at がある）は
 * get・一覧から外す（消したのと同じに見せる）。ゴミ箱から扱うのは findByPath・trashed・trashedIds・setTrashed だけ
 */
export function createProjectStore(db: DatabaseSync, onChange: Notify) {
  const rows = projectsTable.on(db, (change) =>
    onChange(change.kind === "upsert" ? { type: "project", project: change.row } : { type: "project_deleted", id: Number(change.id) }),
  );
  const trashed = (): Project[] => rows.raw.list("trashed_at IS NOT NULL").sort((a, b) => a.id - b.id);
  return {
    get: (id: number): Project | undefined => rows.get(id),
    /** すべて（サイドバーの並び順） */
    list: (): Project[] => rows.list(),
    /** そのフォルダのプロジェクト（ゴミ箱のものも） */
    findByPath: (repoPath: string): Project | undefined => rows.raw.list("repo_path = ?", [repoPath])[0],
    create(input: NewProject): Project {
      // ほかのプロジェクト（しまったもの・ゴミ箱のものも含む）と被らない色。並びは最後
      const hue = pickProjectHue(rows.raw.list().map((p) => p.hue));
      return rows.insert({ name: input.name, description: input.description || null, repo_path: input.repo_path, provider: input.provider, hue });
    },
    update(id: number, patch: ProjectPatch): Project {
      return rows.update(id, patch.tags === undefined ? patch : { ...patch, tags: normalizeTags(patch.tags) });
    },
    /** サイドバーでのプロジェクトの並び順を ids の順にする（書いていないものは後ろに続ける。並べたあとの一覧を返す） */
    reorder: (ids: number[]): Project[] => rows.reorder(ids),
    /** ゴミ箱にあるプロジェクト（同じフォルダをもう一度登録しようとしたときに知らせる・本当に消す） */
    trashed,
    /** ゴミ箱にあるプロジェクトの番号（そのプロジェクトだけの定型文などを外す） */
    trashedIds: (): Set<number> => new Set(trashed().map((p) => p.id)),
    /** ゴミ箱に入れる（at）・戻す（null）。入れたら消したのと同じに、戻したらプロジェクトとして知らせる */
    setTrashed(id: number, at: string | null): void {
      db.prepare("UPDATE projects SET trashed_at = ? WHERE id = ?").run(at, id);
      if (at !== null) onChange({ type: "project_deleted", id });
      else {
        const project = rows.get(id);
        if (project) onChange({ type: "project", project });
      }
    },
    /** 消す（消した知らせは、なかったときも出す） */
    delete(id: number) {
      if (!rows.remove(id)) onChange({ type: "project_deleted", id });
    },
  };
}
