// プロジェクトを Kickoff のゴミ箱に入れる。ゴミ箱にある間はプロジェクトの行（チャット・DB の接続・定型文・設定など、プロジェクトに付くもの）を丸ごと残し、
// ふだんの読み取りから外すだけ。中のチャットは、上の機能 chat が登録した口が同じ行で入れる（chats.trashed_with）。戻す・本当に消すのは chat が登録する種類の扱い
import type { DatabaseSync } from "node:sqlite";
import type { Project } from "@shared/projects/types";
import { tx } from "@/foundation/core/db/tx";
import type { StoredTrashItem } from "@/features/trash/core/db/trash";
import type { TrashService } from "@/features/trash/core/service";

/** プロジェクトをゴミ箱へ入れる（作業中のチャットがないことは呼ぶ側が確かめる。中のチャットは trashed が同じ行で入れる）。入れたゴミ箱の行を返す */
export function trashProject(
  deps: {
    db: Pick<DatabaseSync, "exec" | "isTransaction">;
    projects: { setTrashed(id: number, at: string | null): void };
    trashBin: Pick<TrashService, "addRecord">;
    trashed: (project: Project, trashId: string, at: string) => void;
  },
  project: Project,
  at = new Date().toISOString(),
): StoredTrashItem {
  // 行を足して中のチャットとプロジェクトを隠すまでを 1 つに（間で失敗すると、中身のないゴミ箱の行が残るため）
  return tx(deps.db, () => {
    const item = deps.trashBin.addRecord({ project_id: project.id, kind: "project", label: project.name });
    deps.trashed(project, item.id, at);
    deps.projects.setTrashed(project.id, at);
    return item;
  });
}

/** 同じフォルダのプロジェクトがゴミ箱にあれば、そのプロジェクト（もう一度登録しようとしたときに、戻すよう知らせる） */
export function trashedProjectAt(projects: { trashed(): Project[] }, matches: (project: Project) => boolean): Project | undefined {
  return projects.trashed().find(matches);
}
