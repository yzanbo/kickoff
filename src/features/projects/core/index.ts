// プロジェクトの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { TrashApi } from "@/features/trash/core/index";
import { projectRoutes, type ProjectRouteUpper } from "./routes/projects";

export { registerProjectTrash } from "./trash";

export interface ProjectsDeps {
  trash: TrashApi;
}

export interface ProjectsApi {
  /** 上の機能の口を受ける（ルートが使う。組み立ての最後に 1 回だけ。仮の口で、上の機能が登録する形に替えたら消す） */
  attach(upper: ProjectRouteUpper): void;
}

/** プロジェクト（AI の kickoff-trash で入れたものは、元の場所を含む本体のフォルダのプロジェクトのゴミ箱に出す） */
export function createProjects(k: KernelWithStore, deps: ProjectsDeps): CoreFeature<ProjectsApi> {
  deps.trash.addOriginResolver((origin) => k.store.projects.list().find((p) => isInside(realPathLoose(p.repo_path), origin))?.id ?? null);
  let upper: ProjectRouteUpper | null = null;
  return {
    name: "projects",
    api: { attach: (given) => void (upper = given) },
    routes: [
      {
        legacy: (app) => {
          if (!upper) throw new Error("組み立ての最後に projects の attach を呼んでいません");
          projectRoutes(app, { store: k.store, trashBin: deps.trash, ...upper });
        },
      },
    ],
  };
}
