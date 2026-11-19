import { useEffect, useSyncExternalStore } from "react";
import { useRoute } from "@/foundation/ui/navigation/router";
import type { Chat } from "@shared/types";
import { useKnownChat } from "@/features/chat/ui/store/knownChats";

/** プロジェクトごとの、右サイドバーのコードの画面が見ている作業場所と、そのとき付いていったチャット（とその作業場所） */
export interface Followed {
  /** 付いていったチャットと作業場所（"<チャット>:<作業場所>"。同じなら付いていき直さない） */
  follow: string | null;
  /** 見ている作業場所（ワークツリーのフォルダ。undefined なら本体） */
  worktree: string | undefined;
}

// 右サイドバーの中身を切り替えて描き直しても、見ている作業場所を残す（ウィンドウを閉じるまで）
const states = new Map<number, Followed>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const NOT_FOLLOWING: Followed = { follow: null, worktree: undefined };
const setState = (projectId: number, next: Followed) => {
  states.set(projectId, next);
  listeners.forEach((l) => l());
};

/**
 * 右サイドバーのファイル・検索・変更・履歴・DB が見る作業場所。
 * 真ん中に開いているチャット（このプロジェクトのもの）に付いていく: そのチャットを開いた・チャットの作業場所が変わったら、その作業場所に切り替える。
 * チャット以外の画面では直前のまま。中の切り替えで選んだ作業場所は、次にチャット（か、その作業場所）が変わるまで保つ。
 * 右サイドバーの別ウィンドウでも、メインのウィンドウの画面（RouteContext）で決める
 */
export function useSideWorktree(projectId: number): [string | undefined, (worktree: string | undefined) => void] {
  const route = useRoute();
  const chat = useKnownChat(route.name === "chat" ? route.chatId : 0);
  const stored = useSyncExternalStore(subscribe, () => states.get(projectId) ?? NOT_FOLLOWING);
  // 付いていく先が変わったら、描くときから切り替えた値を使い（effect を待たずに 1 回で描く）、覚えるのは描いたあと（知らせは要らない = この部品が読んだ値）
  const state = followWorktree(stored, chat, projectId);
  useEffect(() => {
    if (state !== stored) states.set(projectId, state);
  }, [state, stored, projectId]);
  return [state.worktree, (worktree) => setState(projectId, { ...state, worktree })];
}

/**
 * 真ん中に開いているチャットに付いていった後の状態（変わらなければ同じ物を返す）。チャットがこのプロジェクトのものでなければ付いていかない。
 * 同じチャット・同じ作業場所なら、中で選び直した作業場所を残す
 */
export function followWorktree(state: Followed, chat: Pick<Chat, "id" | "project_id" | "worktree_path"> | undefined, projectId: number): Followed {
  if (!chat || chat.project_id !== projectId) return state;
  const worktree = chat.worktree_path ?? undefined;
  const follow = `${chat.id}:${worktree ?? ""}`;
  return follow === state.follow ? state : { follow, worktree };
}
