// GitHub の issue・PR を開く行き先（open({ kind: "githubItem" })。チャットの見出し・ボードのカードの札が使う）
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { openGitHubItem } from "./openGitHubItem";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** プロジェクトの GitHub タブ（右サイドバーが GitHub を見せていればそこ）で、その issue・PR を開く */
    githubItem: { projectId: number; itemKind: "issue" | "pr"; number: number };
  }
}

export const githubItemTarget: OpenTargetHandler<"githubItem"> = {
  kind: "githubItem",
  open({ projectId, itemKind, number }) {
    openGitHubItem(projectId, { kind: itemKind, number });
    return true;
  },
};
