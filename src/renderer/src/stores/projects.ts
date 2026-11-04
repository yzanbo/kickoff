// プロジェクトの一覧（すべて。しまったものも含む。並びはサーバーと同じ position → id）。
// アプリを開いたときに 1 回読み、作る・変える・並べ替える・消すはサーバーの知らせで直す。部品は useProjects で読む（props で中継しない）
import type { BusEvent, Project } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { useStore } from "./useStore";

const byPosition = (a: Project, b: Project) => a.position - b.position || a.id - b.id;

/** 届いたプロジェクトを一覧に入れる（同じ ID は置き換え、並び順の位置へ） */
const upsertProject = (list: Project[], project: Project) => [...list.filter((p) => p.id !== project.id), project].sort(byPosition);

/** 知らせで一覧を直す（関係なければ同じ一覧） */
export function reduceProjects(list: Project[], event: BusEvent): Project[] {
  if (event.type === "project") return upsertProject(list, event.project);
  if (event.type === "project_deleted" && list.some((p) => p.id === event.id)) return list.filter((p) => p.id !== event.id);
  return list;
}

const projectsStore = createStore<Project[]>({ load: () => api.projects(), reduce: reduceProjects });

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
  /** 一覧を読めなかった理由（読めたら undefined。読めるまで自動で取り直す） */
  error?: string;
}

export function indexProjects(projects: Project[], loaded = true, error?: string): ProjectsIndex {
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  return { projects, projectsById, projectName: (id) => projectsById.get(id)?.name ?? "", loaded, error };
}

const NO_PROJECTS: Project[] = [];
// 一覧（と読めなかった理由）が変わったときだけ引き当てを作り直す（読む部品ごとに作らない）
let last: { list: Project[] | undefined; error: string | undefined; index: ProjectsIndex } | undefined;

/** プロジェクトの一覧と名前の引き当て */
export function useProjects(): ProjectsIndex {
  const { data, error } = useStore(projectsStore);
  if (last && last.list === data && last.error === error) return last.index;
  const index = indexProjects(data ?? NO_PROJECTS, data !== undefined, error);
  last = { list: data, error, index };
  return index;
}
