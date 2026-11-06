import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { stepIndex } from "@/hooks/useListNavigation";
import { useChatPaneState } from "@/features/chat/pane/chatPaneContext";
import type { SubagentTree } from "@/features/chat/subagents/subagentTree";
import { agentScope, focusedRowIndexes, type ActivityRow } from "./activityRows";

/** 動きの強調の様子（カードの「動きで見る」で強調したサブエージェントの行と、いま移っている行） */
export interface ActivityFocus {
  /** 強調しているサブエージェント（していなければ null） */
  key: string | null;
  /** 強調する行のキー */
  keys: ReadonlySet<string>;
  /** いま移っている行のキーと、行の並び（shown）の中の位置（強調していない・行がなければ undefined） */
  currentKey: string | undefined;
  currentIndex: number | undefined;
  /** いま移っている行が、強調する行の何番目か（0 から）と、その数 */
  position: number;
  total: number;
  /** 前・次の強調する行へ移る（端まで行けば反対の端へ） */
  step: (delta: 1 | -1) => void;
}

/**
 * 動きの強調（カードの「動きで見る」）: 絞り込まない行のうち、そのサブエージェントと配下の行（その起動の行も）を強調し、初めの行へ移る。
 * ↑↓ で順に移る。移るときは一番下への付いていきをやめる（新しい行が来ても、見ている場所を動かさない）。
 * 一番下への付いていきの layout effect より後ろで呼ぶ（同じ描き直しで、下へ送ったあとに強調の行へ移すため）
 */
export function useActivityFocus(shown: readonly ActivityRow[], tree: SubagentTree | undefined, scrollRef: RefObject<HTMLDivElement | null>, following: RefObject<boolean>): ActivityFocus {
  const focus = useChatPaneState((s) => s.activityFocus) ?? null;
  const focusKey = focus?.key ?? null;
  const hits = useMemo(() => (focusKey !== null && tree ? focusedRowIndexes(shown, agentScope(tree, focusKey)) : []), [focusKey, tree, shown]);
  const keys = useMemo(() => new Set(hits.map((i) => shown[i].key)), [hits, shown]);
  // 押し直したら（nonce が変わったら）初めの行から
  const [cursor, setCursor] = useState({ nonce: -1, index: 0 });
  const position = focus && cursor.nonce === focus.nonce ? Math.min(cursor.index, Math.max(0, hits.length - 1)) : 0;
  const currentIndex = focus ? hits[position] : undefined;
  const currentKey = currentIndex === undefined ? undefined : shown[currentIndex].key;

  // 押したとき・↑↓ のときだけ移る（行が増えても、いまの行は動かさない）
  const nonce = focus?.nonce;
  const missing = currentKey === undefined;
  useLayoutEffect(() => {
    if (nonce === undefined || currentKey === undefined) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(currentKey)}"]`);
    if (!el) return;
    following.current = false;
    el.scrollIntoView({ block: "center" });
  }, [nonce, position, missing]);

  return {
    key: focusKey,
    keys,
    currentKey,
    currentIndex,
    position,
    total: hits.length,
    step: (delta) => {
      if (focus && hits.length > 0) setCursor({ nonce: focus.nonce, index: stepIndex(position, delta, hits.length) });
    },
  };
}
