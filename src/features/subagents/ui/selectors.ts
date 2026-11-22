// サブエージェントの取り出し口（チャットの店の記録・途中経過・作業中の様子から作る）
import { useMemo } from "react";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { SubagentInfo, BackgroundState } from "@shared/ai/turnEvents";
import { collectSubagents, type SubagentEntry } from "@shared/chat/subagents";
import { subagentAskers } from "@shared/chat/subagentState";
import { ancestors } from "@shared/foundation/tree";
import { defineChatSelector, latestOf, memoLast, relativeOf, useChatOf, type ChatSource } from "@/features/chat/ui";
import { useProjects } from "@/features/projects/ui";
import { subagentTree, type SubagentTree } from "./model/subagentTree";
import { agentHues } from "./model/agentHues";
import type { SubagentsView } from "./subagentsContext";

/** チャットのサブエージェント（一覧・入れ子・色・回答待ち） */
export interface ChatSubagents {
  /** 一覧（起動した順。途中経過の時刻を足し、入れ子の祖先にも伝えたもの） */
  entries: SubagentEntry[];
  /** 入れ子（流れの中のカード・ピルの一覧・右の欄のタブ） */
  tree: SubagentTree;
  /** 色相（起動した順。agentHues） */
  hues: ReadonlyMap<string, number>;
  /** 回答待ちの依頼を出しているサブエージェント（行のキー） */
  waiting: ReadonlySet<string>;
  /** 回答待ちの依頼ごとの、依頼を出しているサブエージェント（依頼の ID → 行のキー。承認カードの「〜からの依頼」） */
  askers: ReadonlyMap<string, string>;
}

/** 途中経過を足した、サブエージェントの一覧（裏で動いているものの一覧にないものは、もう動いていない） */
function subagentEntries(events: ChatEvent[], progress: Record<string, SubagentInfo>, progressAt: Record<string, string>, busy: boolean, background: BackgroundState | null): SubagentEntry[] {
  const entries = collectSubagents(events, progress, busy, background ? new Set(background.tasks.map((t) => t.task_id)) : undefined);
  const withProgress = entries.map((s) => {
    const at = s.agentId ? progressAt[s.agentId] : undefined;
    return at && s.status === "running" ? { ...s, lastActivityAt: latestOf(s.lastActivityAt, at) } : s;
  });
  return bubbleProgress(withProgress);
}

/**
 * 途中経過の時刻を、入れ子の祖先の「最後の動き」にも伝える（孫の中の記録は届かず、途中経過だけが届くことがあるため。
 * 子の結果を待っている親を「動きがない」としない）。変わった行だけを作り直す
 */
function bubbleProgress(entries: SubagentEntry[]): SubagentEntry[] {
  const byKey = new Map(entries.map((s) => [s.key, s]));
  for (const s of entries) {
    if (s.lastActivityAt === undefined) continue;
    // 祖先は作り直した行で引く（1 つの祖先に、子孫の動きを順に重ねる）。たどるのはキー
    const ups = ancestors(s.key, (key) => byKey.get(key)?.parentKey);
    for (const up of ups) {
      const ancestor = byKey.get(up);
      if (!ancestor) continue;
      const at = latestOf(ancestor.lastActivityAt, s.lastActivityAt);
      if (at !== ancestor.lastActivityAt) byKey.set(up, { ...ancestor, lastActivityAt: at });
    }
  }
  return entries.map((s) => byKey.get(s.key) ?? s);
}

/** 1 つのチャットの計算（入力（記録の digest・途中経過・作業中か・裏の作業・回答待ち）が前と同じ物なら同じ結果） */
export function createChatSubagents(): (src: ChatSource, chatId: number) => ChatSubagents {
  const entries = memoLast(subagentEntries);
  const tree = memoLast(subagentTree);
  const hues = memoLast(agentHues);
  const askers = memoLast(subagentAskers);
  const waiting = memoLast((a: ReadonlyMap<string, string>): ReadonlySet<string> => new Set(a.values()));
  const data = memoLast((list: SubagentEntry[], t: SubagentTree, h: ReadonlyMap<string, number>, a: ReadonlyMap<string, string>): ChatSubagents => ({ entries: list, tree: t, hues: h, waiting: waiting(a), askers: a }));
  return (src, chatId) => {
    const { chat, approvals, live } = src.detail(chatId);
    const { digest } = src.log(chatId);
    const { progress, progressAt } = src.progress(chatId);
    const list = entries(digest, progress, progressAt, chat?.status === "running", live.background);
    return data(list, tree(list), hues(list), askers(approvals, digest, list));
  };
}

/**
 * サブエージェントの一覧・入れ子・色・回答待ち。会話の欄のほか、会話の欄の外の部品（右の欄のタブの印・「サブエージェントを足す」の一覧・
 * 右の欄のサブエージェントの画面）が直接読む（同じ世代なら同じ値。二重に作らない）
 */
export const chatSubagents = defineChatSelector(["detail", "log", "progress"], createChatSubagents);

/** カード・画面が読む記録（記録全体から作るものに渡す digest・中身のまま読んだ記録・読んだ範囲） */
const subagentLog = defineChatSelector(["log"], () => {
  const data = memoLast((events: ChatEvent[], loaded: ChatEvent[], tailStart: number, hasEarlier: boolean) => ({ events, loaded, tailStart, hasEarlier }));
  return (src, chatId) => {
    const { digest, loaded, tailStart, hasEarlier } = src.log(chatId);
    return data(digest, loaded, tailStart, hasEarlier);
  };
});

/** サブエージェントのカード・画面が読むもの（SubagentsView。チャットを読めていなければ null） */
export function useChatSubagentsView(chatId: number): SubagentsView | null {
  const { tree, hues, waiting, askers } = chatSubagents.useFor(chatId);
  const chat = useChatOf(chatId);
  const { events: digest, loaded, tailStart, hasEarlier } = subagentLog.useFor(chatId);
  const { projectsById } = useProjects();
  const repoPath = chat ? projectsById.get(chat.project_id)?.repo_path : undefined;
  const projectId = chat?.project_id;
  const worktree = chat?.worktree_path ?? null;
  const busy = chat?.status === "running";
  return useMemo(
    () =>
      projectId === undefined
        ? null
        : { chatId, projectId, worktree, rel: relativeOf(repoPath), busy, events: digest, loaded, tailStart, hasEarlier, tree, hues, waiting, askers },
    [chatId, projectId, worktree, repoPath, busy, digest, loaded, tailStart, hasEarlier, tree, hues, waiting, askers],
  );
}
