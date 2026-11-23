// git が拡張点に出すもの（app/renderer/registry.ts が入れる）: 変更のタブの種類（と AI に返す説明）と、プロジェクトの画面の変更・履歴、チャットの右の欄の「＋ ▾」の変更、ファイルの画面・プロジェクトの設定への Git の口
import { panelTabs } from "@/features/panel/ui";
import { projectGit, projectViews } from "@/features/projects/ui";
import { changesTabKind } from "./changesTabKind";
import { chatSideAdds } from "@/features/chatPanel/ui";
import { changesChatSideAdd, changesView, historyView } from "./projectViews";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { changesPopout } from "./popoutKinds";
import { filesGit } from "@/features/files/ui";
import { gitForFiles } from "./filesGit";
import { gitForProjects } from "./projectGit";
import { describeTab, userViewTabs } from "@/features/userView/ui";

export const contributes = [
  panelTabs.item(changesTabKind),
  userViewTabs.item(describeTab("changes", (t) => ({ kind: "changes", worktree: t.worktree ?? null, focus: t.focus ?? null, project_id: t.projectId }))),
  projectViews.item(changesView), projectViews.item(historyView), chatSideAdds.item(changesChatSideAdd), popoutKinds.item(changesPopout), filesGit.item(gitForFiles), projectGit.item(gitForProjects),
];
