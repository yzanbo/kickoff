// GitHub の issue・PR と CI の実行を開く行き先（open({ kind: "githubItem" })・open({ kind: "ciRun" })。チャットの見出し・ボードのカードの札・CI の失敗の通知が使う）
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { openGitHubItem } from "./openGitHubItem";
import { openCiRun } from "./ci/ciLinks";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** プロジェクトの GitHub タブ（右サイドバーが GitHub を見せていればそこ）で、その issue・PR を開く */
    githubItem: { projectId: number; itemKind: "issue" | "pr"; number: number };
    /** プロジェクトの CI のタブ（右サイドバーが CI を見せていればそこ）で、その実行（jobId があればそのジョブ）を開く */
    ciRun: { projectId: number; runId: number; jobId?: number | null };
  }
}

export const githubItemTarget: OpenTargetHandler<"githubItem"> = {
  kind: "githubItem",
  open({ projectId, itemKind, number }) {
    openGitHubItem(projectId, { kind: itemKind, number });
    return true;
  },
};

export const ciRunTarget: OpenTargetHandler<"ciRun"> = {
  kind: "ciRun",
  open({ projectId, runId, jobId }) {
    openCiRun(projectId, runId, jobId ?? null);
    return true;
  },
};
