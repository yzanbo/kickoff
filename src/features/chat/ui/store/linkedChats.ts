// GitHub の issue・PR に結び付いたチャット（GitHub タブの一覧の行の印）
import { useMemo } from "react";
import type { Chat } from "@shared/chat/types";
import { useChats } from "./knownChats";

/** そのリポジトリの issue・PR に結び付いたチャットを「種類:番号」ごとに（並びは chats の順。リポジトリの名前は大文字・小文字を区別しない） */
export function groupLinkedChats(chats: readonly Chat[], repo: string): Map<string, Chat[]> {
  const map = new Map<string, Chat[]>();
  for (const c of chats) {
    if (c.github_number === null || c.github_kind === null || c.github_repo?.toLowerCase() !== repo.toLowerCase()) continue;
    const key = `${c.github_kind}:${c.github_number}`;
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  return map;
}

/** プロジェクトのチャットのうち、そのリポジトリの issue・PR に結び付いたもの（「種類:番号」→ 最近動いた順） */
export function useChatsLinkedTo(projectId: number, repo: string): Map<string, Chat[]> {
  const { chats } = useChats({ projectId });
  return useMemo(() => groupLinkedChats(chats, repo), [chats, repo]);
}
