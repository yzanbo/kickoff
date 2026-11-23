// DB の場所: どの接続を、どのプロジェクトの、どの作業場所で使うか（ルートとチャットの AI が組んでサービスに渡す）
import type { DbConnection } from "@shared/database/types";
import type { Project } from "@shared/projects/types";

export interface DbScope {
  connection: DbConnection;
  project: Project;
  /** 作業場所のフォルダ（null なら本体。SQLite の相対パスはこの中の同じパス） */
  workdir: string | null;
}

/** 受け口の作業場所（本体ならプロジェクトのフォルダ）を DB の場所の形にする（本体は null） */
export const workplaceOf = (project: Project, workdir: string): string | null => (workdir === project.repo_path ? null : workdir);

/** 受け口の文脈（接続・プロジェクト・作業場所）から DB の場所を組む */
export const resolveDbScope = (connection: DbConnection, project: Project, workdir: string): DbScope => ({ connection, project, workdir: workplaceOf(project, workdir) });
