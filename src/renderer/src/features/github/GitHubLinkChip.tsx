import { CircleDot, GitPullRequest } from "lucide-react";
import type { Chat, GitHubLink } from "@shared/types";
import { navigate } from "@/app/router";
import { readSetting, writeSetting } from "@/lib/storage";
import { githubFilters, githubSelected } from "@/lib/storageKeys";

/** GitHub タブでその issue・PR を開く（一覧を issue｜PR のその種類にし、中身にそれを出す） */
export function openGitHubItem(projectId: number, link: Pick<GitHubLink, "kind" | "number">) {
  writeSetting(githubFilters(projectId), { ...readSetting(githubFilters(projectId)), kind: link.kind });
  writeSetting(githubSelected(projectId), `${link.kind}:${link.number}`);
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
      className="github-link-chip"
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
