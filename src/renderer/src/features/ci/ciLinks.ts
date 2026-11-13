// CI のタブで開く実行（PR のチェックの「ログを開く」・CI の失敗の通知から）
import { navigate } from "@/app/router";
import { writeSetting } from "@/lib/storage";
import { ciSelected } from "@/lib/storageKeys";
import { ciSelectedText } from "./ciView";

/** CI のタブで開いている実行をそれにする（jobId を渡すと、そのジョブを開く） */
export function selectCiRun(projectId: number, runId: number, jobId: number | null = null) {
  writeSetting(ciSelected(projectId), ciSelectedText(runId, jobId));
}

/** プロジェクトの CI のタブへ移って、その実行（とジョブ）を開く */
export function openCiRun(projectId: number, runId: number, jobId: number | null = null) {
  selectCiRun(projectId, runId, jobId);
  navigate({ name: "project", id: projectId, tab: "ci" });
}
