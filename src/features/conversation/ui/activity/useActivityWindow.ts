import { useState, type RefObject } from "react";
import { createLruMap } from "@/foundation/ui/lib/lruMap";
import { useRowWindow } from "@/features/conversation/ui/timeline/rowWindow/useRowWindow";
import type { RowLayoutContext } from "@/features/conversation/ui/timeline/rowWindow/rowWindowTypes";
import { chatLog, type ActivityFilter } from "@/features/chat/ui";
import type { ActivityRow } from "./activityRows";

/** 覚える行の高さの数（動きを開いている間だけ） */
const ACTIVITY_SIZES = 5000;

/**
 * 動きの窓（useRowWindow を新しい側が上で使う）: 行の高さは開いている間だけ覚え、見積もりは 1 行（広げたまとまりは呼び出しの数だけ足す）。
 * 絞り込みを変えたら作り直して一番上から。下の端に近づいたら前の記録を読む（同時に 1 つ。読んでも行が増えなければ、増えるまで頼み直さない）
 */
export function useActivityWindow({
  rows,
  expanded,
  scrollRef,
  innerRef,
  chatId,
  filter,
  hasEarlier,
}: {
  rows: ActivityRow[];
  expanded: ReadonlySet<string>;
  scrollRef: RefObject<HTMLDivElement | null>;
  innerRef: RefObject<HTMLDivElement | null>;
  chatId: number;
  filter: ActivityFilter;
  hasEarlier: boolean;
}) {
  const [sizes] = useState(() => createLruMap<string, number>(ACTIVITY_SIZES));
  const estimate = (row: ActivityRow, layout: RowLayoutContext) => Math.round((ROW_EST_PX + (expanded.has(row.key) ? (row.tools?.length ?? 0) * CALL_EST_PX : 0)) * layout.scale);
  const [loading, setLoading] = useState(false);
  const sameAs = `${rows.length}:${rows.at(-1)?.key}`;
  const onNearEnd = hasEarlier
    ? () => {
        const earlier = chatLog.loadEarlier(chatId, { sameAs });
        if (!earlier) return;
        setLoading(true);
        void earlier.finally(() => setLoading(false));
      }
    : undefined;
  const w = useRowWindow({
    items: rows,
    keyOf: rowKey,
    estimate,
    sizes,
    scroller: scrollRef,
    list: innerRef,
    newest: "start",
    initial: null,
    resetKey: `${chatId}:${filter.kind === "agent" ? filter.key : filter.kind}`,
    onNearEnd,
  });
  return { ...w, loading };
}

const rowKey = (row: ActivityRow) => row.key;
/** 1 行と、広げたまとまりの呼び出し 1 回の見積もりの高さ（px。文字の倍率 1 のとき） */
const ROW_EST_PX = 26;
const CALL_EST_PX = 22;
