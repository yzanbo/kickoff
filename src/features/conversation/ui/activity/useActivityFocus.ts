import { useEffectEvent, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { stepIndex } from "@/foundation/ui/hooks/useListNavigation";
import { useChatPaneState } from "@/features/chat/ui/screen/ports";
import type { SubagentTree } from "@/features/subagents/ui/model/subagentTree";
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
 * 動きの強調（カードの「動きで見る」）: 絞り込まない行のうち、そのサブエージェントと配下の行（その起動の行も）を強調し、並びの初めの行
 * （上を最新に並べるので、いちばん新しい行）へ移る。shown は画面に並ぶ順で渡す。
 * ↑↓ で順に移る。移るときは一番上への付いていきをやめる（新しい行が来ても、見ている場所を動かさない）。移る先が窓の外なら、reveal で描いてから移る。
 * 一番上への付いていきの layout effect より後ろで呼ぶ（同じ描き直しで、上へ送ったあとに強調の行へ移すため）
 */
export function useActivityFocus(
  shown: readonly ActivityRow[],
  tree: SubagentTree | undefined,
  scrollRef: RefObject<HTMLDivElement | null>,
  followingRef: RefObject<boolean>,
  reveal: (index: number) => Promise<void>,
): ActivityFocus {
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
  const revealCurrent = useEffectEvent((isAlive: () => boolean) => {
    if (currentKey === undefined || currentIndex === undefined) return;
    followingRef.current = false;
    void reveal(currentIndex).then(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(currentKey)}"]`);
      if (isAlive()) el?.scrollIntoView({ block: "center" });
    });
  });
  useLayoutEffect(() => {
    if (nonce === undefined) return;
    let alive = true;
    revealCurrent(() => alive);
    return () => {
      alive = false;
    };
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
