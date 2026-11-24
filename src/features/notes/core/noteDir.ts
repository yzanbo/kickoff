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
  /** 書く前に（作る・書く・動かす・ゴミ箱へ・チャットの実行）: フォルダ名をまだ決めていなければ、プロジェクト名から決めて覚え、フォルダを返す */
  ensureNoteDir(project: Project): string;
  /** dir をノートのフォルダにしているプロジェクト（except を除く。決めていないプロジェクトは数えない。~ とリンクを解いた実体で比べる） */
  usersOf(dir: string, except?: number): Project[];
}

export function createNoteDirs(d: { projects: Pick<ProjectStore, "get" | "list" | "trashed" | "update">; notesDir(): string | null; defaultDir: string }): NoteDirs {
  const rootDir = () => expandHome(d.notesDir() ?? d.defaultDir);
  // ほかのプロジェクトのフォルダ名と重ねない。ゴミ箱のものとも（戻したときに 2 つが同じフォルダを指さないように）
  const plannedFolder = (p: Project) => projectNoteFolder(p.name, [...d.projects.list(), ...d.projects.trashed()], p.id);
  const dirOf = (project: Project) => (project.note_dir ? expandHome(project.note_dir) : path.join(rootDir(), project.note_folder ?? plannedFolder(project)));
  return {
    defaultDir: d.defaultDir,
    rootDir,
    dirOf,
    ensureNoteDir(project) {
      const current = d.projects.get(project.id) ?? project;
      if (!current.note_dir && !current.note_folder) d.projects.update(current.id, { note_folder: plannedFolder(current) });
      return dirOf(d.projects.get(project.id) ?? current);
    },
    usersOf(dir, except) {
      const target = realPathLoose(path.resolve(expandHome(dir)));
      const root = rootDir();
      return d.projects.list().filter((p) => {
        if (p.id === except) return false;
        const own = p.note_dir ? expandHome(p.note_dir) : p.note_folder ? path.join(root, p.note_folder) : null;
        return own !== null && realPathLoose(path.resolve(own)) === target;
      });
    },
  };
}
