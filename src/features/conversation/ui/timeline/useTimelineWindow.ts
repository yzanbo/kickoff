import { useState } from "react";
import { useRowWindow, type RowLayoutContext, type RowWindow } from "@/features/conversation/ui/timeline/rowWindow/useRowWindow";
import { nextCorrection, type EstimateContext } from "./rowEstimate";
import { estimateItem, estimateRaw, rowKindOf } from "./rowKinds";
import { turnExtras } from "./selectors";
import { itemIndexOfEvent } from "./timelineWindow";
import type { TimelineItem } from "./timelineItems";
import type { TimelineScroll } from "./timelineScroll";
import { chatLog, timelineView } from "@/features/chat/ui";

/** 読んでいない記録の読み足しの様子（チャットの店。読むのは chatLog） */
export interface TimelinePaging {
  /** 流れに出す記録より前に、読んでいない記録があるか */
  hasEarlier: boolean;
  /** 途中の一部分を出しているか（下に末尾がある） */
  focused: boolean;
  /** 読んでいる最中か */
  paging: boolean;
}

const itemKey = (item: TimelineItem) => item.key;

/**
 * チャットの流れの窓（画素で決める窓 useRowWindow を流れ用に包む）。
 * 流れの項目は、記録の口の読み込んだ範囲（末尾か、遠くへ移ったときの途中の一部分）から作り、窓の外は測った高さ（見え方の店の sizes。
 * なければ見積もり rowEstimate）の箱にする。スクロールバーのつまみは読み込んだ範囲の全体を表す（読んでいない前の分の箱は置かない）。
 * - 読んだ範囲の始まりに近づいたら前の記録を読み（loadEarlier。読んでいる間は流れの上に「読み込み中…」）、途中の一部分の終わりに近づいたら
 *   後ろを読む（loadLater。末尾とつながったら途中の一部分をやめる）
 * - 移る処理（指示へ・検索から・カードへ・子チャットの聞いた位置）は reveal(記録の ID) を待ってから移る（描いて測り終えたら解決する）
 * - 開き直したとき（見え方の店に読んでいた位置があり、そのあと新しい項目が届いていなければ）はその位置から
 */
export function useTimelineWindow({
  items,
  chatId,
  scroll,
  log,
  initial,
  onDrawn,
}: {
  items: TimelineItem[];
  chatId: number;
  /** 流れのスクロールの持ち主（枠と並びの要素） */
  scroll: TimelineScroll;
  log: TimelinePaging;
  /** 開いたときの位置（覚えた位置。なければ一番下） */
  initial: { key: string; offset: number } | null;
  /** 描く行が変わって描き終えた */
  onDrawn?: () => void;
}) {
  const view = timelineView(chatId);
  // 見積もり（種類ごとの補正は見え方の店に置き、測るたびに進める）
  const estimate = (item: TimelineItem, layout: RowLayoutContext) => estimateItem(item, contextOf(chatId, view, layout));
  const onMeasured = (item: TimelineItem, height: number, layout: RowLayoutContext) => {
    const kind = rowKindOf(item).estimateKind(item);
    view.correction.set(kind, nextCorrection(view.correction.get(kind), height, estimateRaw(item, contextOf(chatId, view, layout))));
  };
  // 前・後ろを読み足しているか（頼んでから、その読み込みが終わるまで。流れの上・下に「読み込み中…」）。
  // 同時に頼むのは 1 つ・読み足しても流れの項目が変わらなかったら（もう読めない・失敗した）項目が変わるまで同じ側を頼み直さない（店の sameAs）
  const [asked, setAsked] = useState<"earlier" | "later" | null>(null);
  const { hasEarlier, focused, paging } = log;
  const sameAs = `${items[0]?.key}:${items.length}`;
  const ask = (side: "earlier" | "later") => {
    const loading = side === "earlier" ? chatLog.loadEarlier(chatId, { sameAs }) : chatLog.loadLater(chatId, { sameAs });
    if (!loading) return;
    setAsked(side);
    void loading.finally(() => setAsked(null));
  };
  const onNearStart = hasEarlier && !paging ? () => ask("earlier") : undefined;
  const onNearEnd = focused && !paging ? () => ask("later") : undefined;
  const w: RowWindow = useRowWindow({
    items,
    keyOf: itemKey,
    estimate,
    sizes: view.sizes,
    onMeasured,
    scroller: scroll.ref,
    list: scroll.inner,
    newest: "end",
    initial,
    resetKey: chatId,
    onNearStart,
    onNearEnd,
    onDrawn,
  });
  return {
    ...w,
    /** 流れの項目（読み込んだ範囲の全体。描くのは runs の行だけ） */
    items,
    /** 流れ全体の最後の項目（作業中の文はいまの状態で決める） */
    last: items.at(-1),
    /** 前・後ろを読み足している最中か（上・下に「読み込み中…」の 1 行） */
    loadingEarlier: asked === "earlier",
    loadingLater: asked === "later",
    /** 記録の ID の発言を描く（前後も）。描いて測り終えたら解決する（流れに出していない記録なら、すぐ解決する） */
    revealEvent: (eventId: number): Promise<void> => w.reveal(itemIndexOfEvent(items, eventId)),
  };
}

/** 見積もりの文脈（幅・倍率・開閉・補正・変更カード） */
function contextOf(chatId: number, view: ReturnType<typeof timelineView>, layout: RowLayoutContext): EstimateContext {
  const open = view.open.get();
  const extras = turnExtras.read(chatId);
  return {
    textWidth: layout.width || 720,
    scale: layout.scale,
    isOpen: (key) => open.has(key),
    correction: (kind) => view.correction.get(kind) ?? 1,
    hasTurnChanges: (resultId) => extras.get(resultId)?.changes !== undefined,
  };
}

/** 流れの窓（描く行と箱・移る処理・読み足しの様子） */
export type TimelineWindow = ReturnType<typeof useTimelineWindow>;
