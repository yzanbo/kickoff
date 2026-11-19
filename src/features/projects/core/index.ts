// プロジェクトの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { TrashApi } from "@/features/trash/core/index";

export interface ProjectsDeps {
  trash: TrashApi;
}

/** プロジェクト（ルートはまだ仮の機能 legacy。AI の kickoff-trash で入れたものは、元の場所を含む本体のフォルダのプロジェクトのゴミ箱に出す） */
export function createProjects(k: KernelWithStore, deps: ProjectsDeps): CoreFeature<null> {
  deps.trash.addOriginResolver((origin) => k.store.projects.list().find((p) => isInside(realPathLoose(p.repo_path), origin))?.id ?? null);
  return { name: "projects", api: null };
}
