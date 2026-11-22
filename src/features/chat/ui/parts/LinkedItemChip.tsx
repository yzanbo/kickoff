import { CircleDot, GitPullRequest } from "lucide-react";
import type { Chat } from "@shared/chat/types";
import { canOpenExternal } from "@/foundation/ui/external/native";
import { open } from "@/foundation/ui/navigation/open";

/**
 * チャットが結び付いた GitHub の issue・PR の札（「#12」。チャットの見出し・ボードのカード）。押すと GitHub タブでそれを開く（行き先 githubItem）。
 * GitHub タブはこの Mac のアプリの中だけなので、ブラウザ・スマホでは出さない
 */
export function LinkedItemChip({ chat }: { chat: Pick<Chat, "project_id" | "github_repo" | "github_number" | "github_kind"> }) {
  const { github_number: number, github_kind: kind } = chat;
  if (number === null || kind === null || !canOpenExternal()) return null;
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
        open({ kind: "githubItem", projectId: chat.project_id, itemKind: kind, number });
      }}
    >
      <Icon size={11} aria-hidden />#{number}
    </button>
  );
}
