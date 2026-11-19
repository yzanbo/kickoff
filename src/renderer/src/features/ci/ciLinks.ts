// CI のタブで開く実行（PR のチェックの「ログを開く」・CI の失敗の通知から）
import { navigate } from "@/app/router";
import { writeSetting } from "@/lib/storage";
import { ciSelected } from "@/lib/storageKeys";
import { ciSelectedText } from "./ciView";
import { isSideViewShown, showSideView } from "@/features/panel/projectChat/sideView";

/** CI のタブで開いている実行をそれにする（jobId を渡すと、そのジョブを開く） */
function selectCiRun(projectId: number, runId: number, jobId: number | null = null) {
  writeSetting(ciSelected(projectId), ciSelectedText(runId, jobId));
}

/** プロジェクトの CI のタブへ移って、その実行（とジョブ）を開く */
export function openCiRun(projectId: number, runId: number, jobId: number | null = null) {
  selectCiRun(projectId, runId, jobId);
  // 右サイドバーが CI を見せていれば、真ん中の画面は動かさずに右サイドバーで開く（開いているものは設定で共有。メモの仕様書「0031」の Q7）
  if (isSideViewShown(projectId, "ci")) return showSideView(projectId, "ci");
  navigate({ name: "project", id: projectId, tab: "ci" });
}
