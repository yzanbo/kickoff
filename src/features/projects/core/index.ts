// プロジェクトの機能のコアの入口（ほかの機能はここだけを読む）
import type { Project } from "@shared/projects/types";
import type { CoreFeature } from "@/foundation/core/feature";
import { idParam, type Param } from "@/foundation/core/http/implement";
import { requireProject } from "@/foundation/core/http/lookups";
import type { Kernel } from "@/foundation/core/kernel";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { TrashApi } from "@/features/trash/core/index";
import { projectRoutes } from "./routes";
import type { NoteFolderName, ProjectHooks } from "./service";
import { createProjectStore, type ProjectStore } from "./db/projects";

export type { ProjectStore } from "./db/projects";

export interface ProjectsDeps {
  trash: TrashApi;
  /** 新しいプロジェクトのノートのフォルダ名（notes の決まり。組み立てが渡す） */
  noteFolderName: NoteFolderName;
}

/** プロジェクトの口（上の機能はここに登録する。プロジェクトは chat・github より下なので、上の力は登録で受ける） */
export interface ProjectsApi {
  /** プロジェクトの店（上の機能が読む） */
  store: ProjectStore;
  /** そのプロジェクト（なければ 404「プロジェクトが見つかりません」） */
  require(id: number): Project;
  /** ルートの :projectId の引き当て（なければ 404。受け口の全体を登録された包み k.workplace.projectScopes の中で流す） */
  param: Param<Project>;
  /** 作業中のチャットがあるか（chat が登録。フォルダを変える・git の管理を始める・ゴミ箱に入れるのを 409 で断る） */
  addBusyCheck(check: ProjectHooks["isBusy"]): void;
  /** 設定を変えたあと（github が登録: GitHub の連携・アーカイブを変えたら PR の見張りを聞き直す） */
  afterUpdate(fn: ProjectHooks["afterUpdate"]): void;
  /** 本体のフォルダを変えたあと（workplaceMove が登録: チャットの作業場所を移す） */
  afterRepoMove(fn: ProjectHooks["afterRepoMove"]): void;
  /** プロジェクトをゴミ箱に入れたとき（chat が登録: 中のチャットを同じ行で入れ、作業中の状態を捨てる） */
  onTrashed(fn: ProjectHooks["trashed"]): void;
}

/** プロジェクト（AI の kickoff-trash で入れたものは、元の場所を含む本体のフォルダのプロジェクトのゴミ箱に出す） */
export function createProjects(k: Kernel, deps: ProjectsDeps): CoreFeature<ProjectsApi> {
  const store = createProjectStore(k.db, (e) => k.bus.publish(e));
  deps.trash.addOriginResolver((origin) => store.list().find((p) => isInside(realPathLoose(p.repo_path), origin))?.id ?? null);
  const busyChecks: ProjectHooks["isBusy"][] = [];
  const updated: ProjectHooks["afterUpdate"][] = [];
  const repoMoved: ProjectHooks["afterRepoMove"][] = [];
  const trashed: ProjectHooks["trashed"][] = [];
  const hooks: ProjectHooks = {
    isBusy: (projectId) => busyChecks.some((check) => check(projectId)),
    afterUpdate: (project, changed) => {
      for (const fn of updated) fn(project, changed);
    },
    afterRepoMove: async (before, moves) => {
      for (const fn of repoMoved) await fn(before, moves);
    },
    trashed: (project, trashId, at) => {
      for (const fn of trashed) fn(project, trashId, at);
    },
  };
  const param: Param<Project> = { ...idParam((id) => store.get(id), "プロジェクトが見つかりません"), around: (project, run) => k.workplace.projectScopes.run(project, run) };
  return {
    name: "projects",
    api: {
      store,
      require: (id) => requireProject({ projects: store }, id),
      param,
      addBusyCheck: (check) => void busyChecks.push(check),
      afterUpdate: (fn) => void updated.push(fn),
      afterRepoMove: (fn) => void repoMoved.push(fn),
      onTrashed: (fn) => void trashed.push(fn),
    },
    routes: [projectRoutes({ db: k.db, settings: k.settings, projects: store, trashBin: deps.trash, hooks, noteFolderName: deps.noteFolderName }, param)],
  };
}
