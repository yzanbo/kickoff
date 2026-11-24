// github が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { messageActions, type MessageMenuContext } from "@/features/conversation/ui";
import { openTargets } from "@/foundation/ui/navigation/open";
import { lazyPart } from "@/foundation/ui/points";
import { ciRunTarget, githubItemTarget } from "./openTargets";
import { projectViews } from "@/features/projects/ui";
import { ciView, githubView } from "./projectViews";
import { settingsSections } from "@/features/settings/ui";
import { githubSettingsSection } from "./settings/settingsSections";
import { appHosts } from "@/foundation/ui/shell/points";
import { workplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";
import { githubHosts, prNoticeDecor } from "./appHosts";
import { branchMenuItems, projectGitHubSources } from "@/features/git/ui";
import { worktreePullRequests } from "@/features/worktrees/ui";
import { githubApi } from "./api/github";
import { pushPrItem } from "./pushPrItem";
import { viewDescribers } from "@/foundation/ui/shell/viewDescribers";
import { githubDescriber } from "./viewDescriber";

export const contributes = [
  openTargets.item(githubItemTarget),
  openTargets.item(ciRunTarget),
  projectViews.item(githubView),
  projectViews.item(ciView),
  // プロジェクトの設定の「GitHub」の節
  settingsSections.item(githubSettingsSection),
  // 発言の右クリックの「issue にする」（ノートの項目の下）
  messageActions.item({ kind: "menu", id: "github.issue", order: 20, Items: lazyPart<MessageMenuContext>(() => import("./IssueFromTextItem").then((m) => ({ default: m.IssueFromMessageItem }))) }),
  // アプリの根に置く物と、作業場所の飾り（ワークツリーの PR の知らせ）
  ...githubHosts.map((h) => appHosts.item(h)),
  workplaceDecor.item(prNoticeDecor),
  // 履歴の手元のブランチの右クリックの「プッシュして PR を作る」
  branchMenuItems.item(pushPrItem),
  // 履歴のコミットの「GitHub で開く」の連携先と、ワークツリーの帯の PR（読む・作る）
  projectGitHubSources.item({ projectGitHub: githubApi.projectGitHub }),
  worktreePullRequests.item({ get: githubApi.pullRequest, create: (target) => githubApi.createPullRequest(target) }),
  // AI の get_user_view に返す、開いている issue・PR
  viewDescribers.item(githubDescriber),
];
