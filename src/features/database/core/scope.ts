// DB の場所: どの接続を、どのプロジェクトの、どの作業場所で使うか（ルートとチャットの AI が組んでサービスに渡す）
import type { DbConnection } from "@shared/database/types";
import type { Project } from "@shared/projects/types";

export interface DbScope {
  connection: DbConnection;
  project: Project;
  /** 作業場所のフォルダ（null なら本体。SQLite の相対パスはこの中の同じパス） */
  workdir: string | null;
}
