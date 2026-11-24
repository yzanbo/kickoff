import { useState } from "react";
import type { Chat } from "@shared/chat/types";
import { useBoard } from "./BoardContext";
import type { BoardViewState } from "./layout";
import { workplaceOf } from "@/foundation/ui/workplace/workplace";
import { useWorktreesOf } from "@/foundation/ui/workplace/worktreesStore";
import { useChatSearch } from "@/features/chat/ui";

/** カンバンの絞り込み（アーカイブ（覚えておく）・作業場所・名前の検索） */
export function useKanbanFilters() {
  const { view, patch } = useBoard();
  const archive = view.archive;
  const setArchive = (next: BoardViewState["archive"]) => patch({ archive: next });
  // 作業場所（ワークツリー）での絞り込み（"all" はすべて、"" は本体）
  const [worktree, setWorktree] = useState("all");
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  return { archive, setArchive, worktree, setWorktree, query, setQuery, search };
}

/** 絞り込みの候補: ワークツリーの作業場所（ブランチ名で出し、フォルダが消えたものは「フォルダなし」と添える） */
export function useWorktreeChoices(chats: Chat[]) {
  const worktreeChats = chats.filter((r): r is Chat & { worktree_path: string } => r.worktree_path !== null);
  const worktreesOf = useWorktreesOf(worktreeChats.map((r) => r.project_id));
  return [...new Map(worktreeChats.map((r) => [r.worktree_path, r])).values()]
    .map((r) => {
      const place = workplaceOf(r, worktreesOf(r.project_id));
      return { path: r.worktree_path, label: place.kind === "missing" ? `${place.name}（フォルダなし）` : place.name };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
