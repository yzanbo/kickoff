// 記録全体から作るものの取り出し口（メモの仕様書「0023_表示を軽くする」の M4・M5・分冊 3 の 4 章）
import type { BackgroundState, ChatEvent, ProviderId, SubagentInfo } from "@shared/types";
import { providerAtEvent, providerBoundaries } from "@shared/chat/providerSwitch";
import { collectSubagents, type SubagentEntry } from "@shared/chat/subagents";
import { waitingSubagentKeys } from "@shared/chat/subagentState";
import { workplaceBoundaries, type WorkplaceBoundary } from "@shared/chat/workplaceMoves";
import { createLruMap } from "@/lib/lruMap";
import { latestOf } from "@/features/chat/status/stall";
import { subagentTree, type SubagentTree } from "@/features/chat/subagents/subagentTree";
import { agentHues } from "@/features/chat/subagents/agentHues";
import { chatVisualsOf, type ChatVisuals } from "@/features/chat/visuals/visualsContext";
import { backgroundCallIds } from "@/features/chat/tools/toolStatus";
import type { ChatDetailView, ChatLogView, ChatProgressView } from "./chatStoreTypes";

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
}

/** 取り出し口が読む店の口（アプリでは chatStore。テストは createChatStore で作った店） */
export interface SelectorSource {
  detail(chatId: number): ChatDetailView;
  log(chatId: number): ChatLogView;
  progress(chatId: number): ChatProgressView;
}

/** 中身を覚えておくチャットの数（店に残すチャットより少し多く） */
const MEMO_CHATS = 40;
const NO_CALLS: ReadonlySet<string> = new Set();
const NO_BOUNDARIES: readonly WorkplaceBoundary[] = [];

/** 引数がすべて前と同じ物なら、前の結果を返す（1 つだけ覚える） */
function memoLast<A extends readonly unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; value: R } | null = null;
  return (...args) => {
    if (last && args.every((a, i) => a === last!.args[i])) return last.value;
    const value = fn(...args);
    last = { args, value };
    return value;
  };
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
    let up = s.parentKey;
    for (let depth = 0; up !== undefined && s.lastActivityAt !== undefined && depth < 32; depth++) {
      const ancestor = byKey.get(up);
      if (!ancestor) break;
      const at = latestOf(ancestor.lastActivityAt, s.lastActivityAt);
      if (at !== ancestor.lastActivityAt) byKey.set(up, { ...ancestor, lastActivityAt: at });
      up = ancestor.parentKey;
    }
  }
  return entries.map((s) => byKey.get(s.key) ?? s);
}

/** 1 つのチャットの覚え（入力が前と同じ物なら同じ結果を返す） */
function createMemo() {
  let calls: { key: string; set: ReadonlySet<string> } = { key: "", set: NO_CALLS };
  const entries = memoLast(subagentEntries);
  const tree = memoLast(subagentTree);
  const hues = memoLast(agentHues);
  const waiting = memoLast(waitingSubagentKeys);
  const data = memoLast((list: SubagentEntry[], t: SubagentTree, h: ReadonlyMap<string, number>, w: ReadonlySet<string>): ChatSubagents => ({ entries: list, tree: t, hues: h, waiting: w }));
  const visuals = memoLast(chatVisualsOf);
  const providerBounds = memoLast(providerBoundaries);
  const providerSwitch = memoLast((digest: ChatEvent[]): number => {
    let last = 0;
    for (const event of digest) if (event.type === "provider_switched") last = Math.max(last, event.id);
    return last;
  });
  // 作業場所を移した区切り（記録が増えても区切りが同じなら同じ配列。読む発言・カードを描き直さない）
  let moves: { key: string; list: readonly WorkplaceBoundary[] } = { key: "", list: NO_BOUNDARIES };
  const boundaries = memoLast((digest: ChatEvent[]): readonly WorkplaceBoundary[] => {
    const list = workplaceBoundaries(digest);
    const key = list.map((b) => b.id).join(" ");
    if (key !== moves.key) moves = { key, list: list.length ? list : NO_BOUNDARIES };
    return moves.list;
  });
  const background = memoLast((state: BackgroundState | null): ReadonlySet<string> => {
    const key = backgroundCallIds(state).join(" ");
    if (key !== calls.key) calls = { key, set: key ? new Set(key.split(" ")) : NO_CALLS };
    return calls.set;
  });
  return { entries, tree, hues, waiting, data, visuals, background, boundaries, providerSwitch, providerBounds };
}

/**
 * 記録全体から作るもの（サブエージェント・図・裏で動かしている呼び出し）を、店のいまの値から作る取り出し口。
 * 入力（記録の digest・途中経過・作業中か・裏の作業・回答待ち）が前と同じ物なら同じ結果を返すので、会話の欄と、境目の外で直接読む部品
 * （右の欄のタブの印・「サブエージェントを足す」の一覧・右の欄のサブエージェントの画面）が同じ世代で二重に作らない。
 * 届いた分だけ計算する形（案 10）は、測ったら記録 1 件で 1ms に届かなかったので作らない（分冊 1 の 9 章）
 */
export function createChatSelectors(source: SelectorSource) {
  const memos = createLruMap<number, ReturnType<typeof createMemo>>(MEMO_CHATS);
  const memoOf = (chatId: number) => {
    let memo = memos.get(chatId);
    if (!memo) memos.set(chatId, (memo = createMemo()));
    return memo;
  };
  return {
    /** サブエージェントの一覧・入れ子・色・回答待ち */
    subagents(chatId: number): ChatSubagents {
      const m = memoOf(chatId);
      const { chat, approvals, live } = source.detail(chatId);
      const { digest } = source.log(chatId);
      const { progress, progressAt } = source.progress(chatId);
      const list = m.entries(digest, progress, progressAt, chat?.status === "running", live.background);
      return m.data(list, m.tree(list), m.hues(list), m.waiting(approvals, digest, list));
    },
    /** AI が描いた図（流れの図の項目が読む） */
    visuals: (chatId: number): ChatVisuals => memoOf(chatId).visuals(source.log(chatId).digest),
    /** 作業場所を移した区切り（ID の順。索引にいつも入るので、末尾より前のものも。区切りが同じなら同じ配列） */
    workplaceBoundaries: (chatId: number): readonly WorkplaceBoundary[] => memoOf(chatId).boundaries(source.log(chatId).digest),
    providerSwitch: (chatId: number): number => memoOf(chatId).providerSwitch(source.log(chatId).digest),
    providerAt: (chatId: number, eventId: number): ProviderId | null => {
      const current = source.detail(chatId).chat?.provider;
      return current ? providerAtEvent(memoOf(chatId).providerBounds(source.log(chatId).digest), eventId, current) : null;
    },
    /** 裏でまだ動いている作業を起動した呼び出しの ID（中身が同じなら同じ Set） */
    backgroundCalls: (chatId: number): ReadonlySet<string> => memoOf(chatId).background(source.detail(chatId).live.background),
  };
}
