// CI のタブで開く実行（PR のチェックの「ログを開く」・CI の失敗の通知から）
import { navigate } from "@/foundation/ui/navigation/router";
import { writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/github/ui/storage";
import { ciSelectedText } from "./ciView";
import { isSideViewShown, showSideView } from "@/features/projects/ui";

/** CI のタブで開いている実行をそれにする（jobId を渡すと、そのジョブを開く） */
function selectCiRun(projectId: number, runId: number, jobId: number | null = null) {
  writeSetting(storage.settings.ciSelected(projectId), ciSelectedText(runId, jobId));
}

/** プロジェクトの CI のタブへ移って、その実行（とジョブ）を開く */
export function openCiRun(projectId: number, runId: number, jobId: number | null = null) {
  selectCiRun(projectId, runId, jobId);
  // 右サイドバーが CI を見せていれば、真ん中の画面は動かさずに右サイドバーで開く（開いているものは設定で共有）
  if (isSideViewShown(projectId, "ci")) return showSideView(projectId, "ci");
  navigate({ name: "project", id: projectId, tab: "ci" });
}
