// github が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { messageActions, type MessageMenuContext } from "@/features/conversation/ui";
import { openTargets } from "@/foundation/ui/navigation/open";
import { lazyPart } from "@/foundation/ui/points";
import { githubItemTarget } from "./openTargets";
import { projectViews } from "@/features/projects/ui";
import { ciView, githubView } from "./projectViews";

export const contributes = [
  openTargets.item(githubItemTarget),
  projectViews.item(githubView),
  projectViews.item(ciView),
  // 発言の右クリックの「issue にする」（ノートの項目の下）
  messageActions.item({ kind: "menu", id: "github.issue", order: 20, Items: lazyPart<MessageMenuContext>(() => import("./IssueFromTextItem").then((m) => ({ default: m.IssueFromMessageItem }))) }),
];
