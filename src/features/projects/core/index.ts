// プロジェクトの機能のコアの入口（ほかの機能はここだけを読む）
import type { Project } from "@shared/projects/types";
import type { ProjectGitHub } from "@shared/git/types";
import type { CoreFeature } from "@/foundation/core/feature";
import { idParam, type Param } from "@/foundation/core/http/implement";
import { requireProject } from "@/foundation/core/http/lookups";
import type { Kernel } from "@/foundation/core/kernel";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { TrashApi } from "@/features/trash/core/index";
import { projectRoutes, type ProjectRouteHooks } from "./routes/projects";
import { createProjectStore, type ProjectStore } from "./db/projects";

export type { ProjectStore } from "./db/projects";

export interface ProjectsDeps {
  trash: TrashApi;
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
  addBusyCheck(check: ProjectRouteHooks["isBusy"]): void;
  /** 設定を変えたあと（github が登録: GitHub の連携・アーカイブを変えたら PR の見張りを聞き直す） */
  afterUpdate(fn: ProjectRouteHooks["afterUpdate"]): void;
  /** 本体のフォルダを変えたあと（chat が登録: チャットの作業場所を移す） */
  afterRepoMove(fn: ProjectRouteHooks["afterRepoMove"]): void;
  /** GitHub の連携の様子（github が登録。設定の「GitHub」） */
  provideGitHub(fn: (project: Project) => Promise<ProjectGitHub>): void;
  /** プロジェクトをゴミ箱に入れたとき（chat が登録: 中のチャットを同じ行で入れ、作業中の状態を捨てる） */
  onTrashed(fn: ProjectRouteHooks["trashed"]): void;
}

/** プロジェクト（AI の kickoff-trash で入れたものは、元の場所を含む本体のフォルダのプロジェクトのゴミ箱に出す） */
export function createProjects(k: Kernel, deps: ProjectsDeps): CoreFeature<ProjectsApi> {
  const store = createProjectStore(k.db, (e) => k.bus.publish(e));
  deps.trash.addOriginResolver((origin) => store.list().find((p) => isInside(realPathLoose(p.repo_path), origin))?.id ?? null);
  const busyChecks: ProjectRouteHooks["isBusy"][] = [];
  const updated: ProjectRouteHooks["afterUpdate"][] = [];
  const repoMoved: ProjectRouteHooks["afterRepoMove"][] = [];
  const trashed: ProjectRouteHooks["trashed"][] = [];
  let github: ((project: Project) => Promise<ProjectGitHub>) | null = null;
  const hooks: ProjectRouteHooks = {
    isBusy: (projectId) => busyChecks.some((check) => check(projectId)),
    afterUpdate: (project, changed) => {
      for (const fn of updated) fn(project, changed);
    },
    afterRepoMove: async (before, moves) => {
      for (const fn of repoMoved) await fn(before, moves);
    },
    github: (project) => {
      if (!github) throw new Error("GitHub の連携の様子を出す機能（github）が登録していません");
      return github(project);
    },
    trashed: (project, trashId, at) => {
      for (const fn of trashed) fn(project, trashId, at);
    },
  };
  return {
    name: "projects",
    api: {
      store,
      require: (id) => requireProject({ projects: store }, id),
      param: { ...idParam((id) => store.get(id), "プロジェクトが見つかりません"), around: (project, run) => k.workplace.projectScopes.run(project, run) },
      addBusyCheck: (check) => void busyChecks.push(check),
      afterUpdate: (fn) => void updated.push(fn),
      afterRepoMove: (fn) => void repoMoved.push(fn),
      provideGitHub: (fn) => void (github = fn),
      onTrashed: (fn) => void trashed.push(fn),
    },
    routes: [{ legacy: (app) => projectRoutes(app, { store: { db: k.db, settings: k.settings, projects: store }, trashBin: deps.trash, hooks }) }],
  };
}
