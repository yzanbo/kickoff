import { useMemo, useSyncExternalStore } from "react";
import type { Chat } from "@shared/types";
import { draftAnchor, type DraftTabSpot } from "@/features/chatList/manualOrder";
import { draftTabSpot, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { subscribePanels } from "@/features/panel/state/panelStore";
import { useSidebarChatOrder } from "./sidebarChatOrder";

/** 下書きと、その下書きを並べるまとまりのチャット（match があれば、そのうち下書きと同じまとまりに出すものだけ） */
export interface DraftSlot {
  drafts: readonly PanelDraft[];
  chats: readonly Chat[];
  match?: (chat: Chat, draft: PanelDraft) => boolean;
}

/** 下書きの行の置き場所: チャットの ID → その行のすぐ後ろに置く下書き。ここに入らない下書きは、まとまりのいちばん上に置く */
export type DraftsAfter = ReadonlyMap<number, readonly PanelDraft[]>;

const NO_PLACEMENT: DraftsAfter = new Map();

/**
 * 手動の並びのとき、下書きの行を、タブの列（その欄の一覧のペイン）での下書きのタブの位置に合わせて、チャットの行の間に置く（利用者の依頼。
 * 前は並び順にかかわらず、まとまりのいちばん上に置いていた）。タブの列で下書きより前に見える同じまとまりのチャットの後ろ（draftAnchor）。
 * 手動でない・下書きがないときは何もしない（空の Map）。タブの位置は文字にして比べ、タブの列が変わったときだけ計算し直す
 */
export function useDraftPlacement(slots: readonly DraftSlot[], chats: readonly Chat[], projectId: number, enabled: boolean): DraftsAfter {
  const drafts = slots.flatMap((s) => s.drafts);
  const on = enabled && drafts.length > 0;
  // タブの列と同じ並び（一覧のペインのチャットのタブは、この並びに並べ替えて見せている）
  const order = useSidebarChatOrder(chats, projectId, on);
  const spots = useSyncExternalStore(subscribePanels, () => (on ? JSON.stringify(drafts.map(draftTabSpot)) : ""));
  return useMemo(() => {
    if (!on) return NO_PLACEMENT;
    const list = JSON.parse(spots) as (DraftTabSpot | null)[];
    const after = new Map<number, PanelDraft[]>();
    let i = 0;
    for (const slot of slots) {
      const byId = new Map(slot.chats.map((c) => [c.id, c]));
      for (const draft of slot.drafts) {
        const spot = list[i++];
        const eligible = (id: number) => {
          const chat = byId.get(id);
          return chat !== undefined && (slot.match?.(chat, draft) ?? true);
        };
        const anchor = spot ? draftAnchor(spot, order.index, eligible) : null;
        if (anchor !== null) after.set(anchor, [...(after.get(anchor) ?? []), draft]);
      }
    }
    return after.size === 0 ? NO_PLACEMENT : after;
  }, [on, spots, slots, order]);
}

/** 下書きのうち、チャットの行の後ろに置かないもの（まとまりのいちばん上に置く）。どれも置くなら同じ配列 */
export function unplacedDrafts<D extends PanelDraft>(drafts: D[], after: DraftsAfter): D[] {
  if (after.size === 0 || drafts.length === 0) return drafts;
  const placed = new Set([...after.values()].flat());
  return drafts.some((d) => placed.has(d)) ? drafts.filter((d) => !placed.has(d)) : drafts;
}
