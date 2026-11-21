import { CircleDot, GitPullRequest } from "lucide-react";
import type { Chat, GitHubLink } from "@shared/chat/types";
import { navigate } from "@/foundation/ui/navigation/router";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";
import { githubSelected } from "@/foundation/ui/storage/storageKeys";
import { isSideViewShown, showSideView } from "@/features/projects/ui/rightSidebar/sideView";

/** GitHub タブで開いているものをその issue・PR にする（一覧を issue｜PR のその種類にし、中身にそれを出す。プロジェクトのタブと右の欄で同じ値） */
export function selectGitHubItem(projectId: number, link: Pick<GitHubLink, "kind" | "number">) {
  writeSetting(storage.settings.filters(projectId), { ...readSetting(storage.settings.filters(projectId)), kind: link.kind });
  writeSetting(githubSelected(projectId), `${link.kind}:${link.number}`);
}

/** プロジェクトの GitHub タブへ移って、その issue・PR を開く */
export function openGitHubItem(projectId: number, link: Pick<GitHubLink, "kind" | "number">) {
  selectGitHubItem(projectId, link);
  // 右サイドバーが GitHub を見せていれば、真ん中の画面は動かさずに右サイドバーで開く（開いているものは設定で共有）
  if (isSideViewShown(projectId, "github")) return showSideView(projectId, "github");
  navigate({ name: "project", id: projectId, tab: "github" });
}

/**
 * チャットが結び付いた GitHub の issue・PR の札（「#12」。チャットの見出し・ボードのカード）。押すと GitHub タブでそれを開く。
 * GitHub タブはこの Mac のアプリの中だけなので、ブラウザ・スマホでは出さない
 */
export function GitHubLinkChip({ chat }: { chat: Pick<Chat, "project_id" | "github_repo" | "github_number" | "github_kind"> }) {
  const { github_number: number, github_kind: kind } = chat;
  if (number === null || kind === null || !window.kickoff) return null;
  const Icon = kind === "pr" ? GitPullRequest : CircleDot;
  return (
    <button
      type="button"
      className="github-link-chip tag"
      data-look="outline"
      data-tip={`GitHub の${kind === "pr" ? " PR" : " issue"} ${chat.github_repo ?? ""}#${number} と結び付いています（押すと GitHub タブで開く）`}
      onClick={(e) => {
        // カードを押したことにしない（チャットを開かずに GitHub タブへ）
        e.stopPropagation();
        openGitHubItem(chat.project_id, { kind, number });
      }}
    >
      <Icon size={11} aria-hidden />#{number}
    </button>
  );
}
