import { createContext, useContext } from "react";
import { collectVisuals, type ChatVisual } from "@shared/chat/aiVisual";
import type { ChatEvent } from "@shared/types";

/** チャットの描いた図（記録から組み立てたもの）。流れの図の項目が読む */
export interface ChatVisuals {
  /** 図の ID → いちばん新しい中身 */
  byId: ReadonlyMap<string, ChatVisual>;
  /** ツールの呼び出し ID（show_visual / update_visual）→ 図の ID */
  byCall: ReadonlyMap<string, string>;
  /** 図の ID → 描いた呼び出しの記録の ID（描き直しの行から元の図へ移る `jumpTo`） */
  shownEvent: ReadonlyMap<string, number>;
}

/** 記録から図をまとめる（描いた呼び出し・描き直した呼び出しから図を引けるように） */
export function chatVisualsOf(events: readonly ChatEvent[]): ChatVisuals {
  const byId = collectVisuals(events);
  const byCall = new Map<string, string>();
  for (const visual of byId.values()) {
    byCall.set(visual.shownBy, visual.id);
    for (const call of visual.updatedBy) byCall.set(call, visual.id);
  }
  const shownEvent = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "tool_use") continue;
    const id = byCall.get(e.data.id);
    if (id !== undefined && byId.get(id)?.shownBy === e.data.id) shownEvent.set(id, e.id);
  }
  return { byId, byCall, shownEvent };
}

const EMPTY: ChatVisuals = { byId: new Map(), byCall: new Map(), shownEvent: new Map() };

/** チャットの画面が配る（外では空） */
export const VisualsContext = createContext<ChatVisuals>(EMPTY);

export const useChatVisuals = () => useContext(VisualsContext);
