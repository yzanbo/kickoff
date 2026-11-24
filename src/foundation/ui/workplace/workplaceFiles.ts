// 作業場所のファイルの一覧を読む口（ルートの持ち主の files が 1 つだけ登録する。files より下の機能 = 会話の画面・入力欄の候補が読む）
import type { ProjectFiles } from "@shared/foundation/fileTypes";
import type { GitTarget } from "@/foundation/ui/api/workdir";
import { definePoint } from "@/foundation/ui/points";

export interface WorkplaceFilesSource {
  files(target: GitTarget): Promise<ProjectFiles>;
}

export const workplaceFilesSources = definePoint<WorkplaceFilesSource>("workplaceFilesSources");

/** 作業場所のファイルの一覧（登録がなければ失敗を返す） */
export async function listWorkplaceFiles(target: GitTarget): Promise<ProjectFiles> {
  const source = workplaceFilesSources.items()[0];
  if (!source) throw new Error("ファイルの一覧の口（workplaceFilesSources）が登録されていない");
  return source.files(target);
}
