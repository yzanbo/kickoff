import { MergeDialog } from "./MergeDialog";
import { NewIssueDialog } from "./NewIssueDialog";
import { closeGitHubDialog, useGitHubDialog } from "./githubDialogs";

/** GitHub の書き込みのダイアログ（新しい issue・マージの確認）を描く所（App と別ウィンドウに 1 つずつ置く。githubDialogs.ts の openNewIssue / openMergeDialog で開く） */
export function GitHubDialogHost() {
  const { request, key } = useGitHubDialog();
  if (!request) return null;
  if (request.kind === "new_issue") return <NewIssueDialog key={key} projectId={request.projectId} initialBody={request.body} onCreated={request.onCreated} onClose={closeGitHubDialog} />;
  return <MergeDialog key={key} projectId={request.projectId} detail={request.detail} onMerged={request.onMerged} onClose={closeGitHubDialog} />;
}
