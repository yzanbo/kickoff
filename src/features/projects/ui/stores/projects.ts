// プロジェクトの一覧（すべて。しまったものも含む。並びはサーバーと同じ position → id）。
// アプリを開いたときに 1 回読み、作る・変える・並べ替える・消すはサーバーの知らせで直す。部品は useProjects で読む（props で中継しない）
import type { Project } from "@shared/projects/types";
import type { ReduceTable } from "@/foundation/ui/store";
import { projectsApi } from "@/features/projects/ui/api/projects";
import { createSelector } from "@/foundation/ui/store";
import { createStore } from "@/foundation/ui/store/createStore";
import { useSyncExternalStore } from "react";
import { useStore, useStoreStatus } from "@/foundation/ui/store/useStore";

const byPosition = (a: Project, b: Project) => a.position - b.position || a.id - b.id;

/** 届いたプロジェクトを一覧に入れる（同じ ID は置き換え、並び順の位置へ） */
const upsertProject = (list: Project[], project: Project) => [...list.filter((p) => p.id !== project.id), project].sort(byPosition);

/** 知らせで一覧を直す（関係なければ同じ一覧） */
export const reduceProjects: ReduceTable<Project[]> = {
  project: (list, event) => upsertProject(list, event.project),
  project_deleted: (list, event) => (list.some((p) => p.id === event.id) ? list.filter((p) => p.id !== event.id) : list),
};

const projectsStore = createStore<Project[]>({ load: () => projectsApi.projects(), reduce: reduceProjects });

/** いまのプロジェクトの一覧（部品の外から読む。まだ届いていなければ空） */
export const currentProjects = (): Project[] => projectsStore.get().data ?? [];

/** 一覧から選んだ値（選んだ値が変わったときだけ描き直す。使っている間は一覧の読み込みを頼む） */
export function useProjectsValue<T>(select: (projects: Project[]) => T): T {
  useStoreStatus(projectsStore);
  return useSyncExternalStore(projectsStore.subscribe, () => select(currentProjects()));
}

/** 作ったプロジェクトを、知らせを待たずに一覧へ入れる（作ったらすぐ、そのプロジェクトの画面を開くため） */
export const addProject = (project: Project) => projectsStore.update((list) => upsertProject(list, project));

/** プロジェクトの一覧と、ID からの引き当て（一覧が変わるたびに作り直す） */
export interface ProjectsIndex {
  /** すべてのプロジェクト（しまったものも含む。並びは API と同じ） */
  projects: Project[];
  projectsById: ReadonlyMap<number, Project>;
  /** プロジェクト名（まだ分からなければ空） */
  projectName: (id: number) => string;
  /** 一覧が届いたか（届く前は、見つからなくても「ない」と決めない） */
  loaded: boolean;
  /** 一覧が届いて、もうないとわかったプロジェクトか（消した・URL の番号が違う。一覧が届く前と undefined は false） */
  missing: (id: number | undefined) => boolean;
  /** 一覧を読めなかった理由（読めたら undefined。読めるまで自動で取り直す） */
  error?: string;
}

export function indexProjects(projects: Project[], loaded = true, error?: string): ProjectsIndex {
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  return {
    projects,
    projectsById,
    projectName: (id) => projectsById.get(id)?.name ?? "",
    loaded,
    missing: (id) => id !== undefined && loaded && !projectsById.has(id),
    error,
  };
}

const NO_PROJECTS: Project[] = [];
/** 一覧と読めなかった理由の引き当て（一覧と理由が変わったときだけ作り直す。同じ入力なら、どの部品から呼んでも同じ物） */
const projectsIndexOf = createSelector<[Project[] | undefined, string | undefined], ProjectsIndex>((data, error) => indexProjects(data ?? NO_PROJECTS, data !== undefined, error));

/** プロジェクトの一覧と名前の引き当て（部品の外から読む） */
export const currentProjectsIndex = (): ProjectsIndex => {
  const { data, error } = projectsStore.get();
  return projectsIndexOf(data, error);
};

/** プロジェクトの一覧と名前の引き当て */
export function useProjects(): ProjectsIndex {
  const { data, error } = useStore(projectsStore);
  return projectsIndexOf(data, error);
}
