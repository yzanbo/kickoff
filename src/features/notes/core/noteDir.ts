// プロジェクトのノートのフォルダの場所（設定の notes_dir（なければ既定）の下の、プロジェクトごとのフォルダ。プロジェクトだけ別の場所にもできる）。
// 読むだけではフォルダ名を決めない（決めて覚えるのは書く前の ensureNoteDir）
import path from "node:path";
import { projectNoteFolder } from "@shared/notes/names";
import type { Project } from "@shared/projects/types";
import type { ProjectStore } from "@/features/projects/core/index";
import { expandHome, realPathLoose } from "@/foundation/core/system/paths";

export interface NoteDirs {
  /** 設定の notes_dir が null のときの親フォルダ（製品版と開発版で別） */
  readonly defaultDir: string;
  /** ノートの親フォルダ（設定。なければ既定） */
  rootDir(): string;
  /** プロジェクトのノートのフォルダ（フォルダ名をまだ決めていなければ、決めるならこうなるフォルダ。覚えない） */
  dirOf(project: Project): string;
  /** projects それぞれの dirOf（並びは同じ。プロジェクトの一覧とゴミ箱は 1 回だけ読む） */
  dirsOf(projects: readonly Project[]): string[];
  /** 書く前に（作る・書く・動かす・ゴミ箱へ・チャットの実行）: フォルダ名をまだ決めていなければ、プロジェクト名から決めて覚え、フォルダを返す */
  ensureNoteDir(project: Project): string;
  /** dir をノートのフォルダにしているプロジェクト（except を除く。決めていないプロジェクトは数えない。~ とリンクを解いた実体で比べる） */
  usersOf(dir: string, except?: number): Project[];
  /** usersOf を何度も引く口（プロジェクトの一覧と、それぞれのノートのフォルダの実体は 1 回だけ作る） */
  noteDirOwners(except?: number): (dir: string) => Project[];
}

export function createNoteDirs(d: { projects: Pick<ProjectStore, "get" | "list" | "trashed" | "update">; notesDir(): string | null; defaultDir: string }): NoteDirs {
  const rootDir = () => expandHome(d.notesDir() ?? d.defaultDir);
  // ほかのプロジェクトのフォルダ名と重ねない。ゴミ箱のものとも（戻したときに 2 つが同じフォルダを指さないように）
  const everyProject = () => [...d.projects.list(), ...d.projects.trashed()];
  const plannedFolder = (p: Project, known: () => Project[] = everyProject) => projectNoteFolder(p.name, known(), p.id);
  /** known: フォルダ名を決めていないときに重ねない相手（dirsOf は 1 回だけ読んだものを渡す） */
  const dirIn = (project: Project, root: string, known?: () => Project[]) =>
    project.note_dir ? expandHome(project.note_dir) : path.join(root, project.note_folder ?? plannedFolder(project, known));
  const dirOf = (project: Project) => dirIn(project, rootDir());
  const noteDirOwners = (except?: number) => {
    const root = rootDir();
    const owners = d.projects.list().flatMap((p) => {
      const own = p.id === except ? null : p.note_dir ? expandHome(p.note_dir) : p.note_folder ? path.join(root, p.note_folder) : null;
      return own === null ? [] : [{ project: p, real: realPathLoose(path.resolve(own)) }];
    });
    return (dir: string) => {
      const target = realPathLoose(path.resolve(expandHome(dir)));
      return owners.filter((o) => o.real === target).map((o) => o.project);
    };
  };
  return {
    defaultDir: d.defaultDir,
    rootDir,
    dirOf,
    dirsOf(projects) {
      const root = rootDir();
      let all: Project[] | null = null;
      const known = () => (all ??= everyProject());
      return projects.map((p) => dirIn(p, root, known));
    },
    noteDirOwners,
    ensureNoteDir(project) {
      const current = d.projects.get(project.id) ?? project;
      if (!current.note_dir && !current.note_folder) d.projects.update(current.id, { note_folder: plannedFolder(current) });
      return dirOf(d.projects.get(project.id) ?? current);
    },
    usersOf: (dir, except) => noteDirOwners(except)(dir),
  };
}
