import type { Attachment } from "@shared/chat/types";
import { createCell, useCell } from "@/foundation/ui/store";
import { setKeepAlive } from "@/features/chat/ui";

/** 入力欄で書き直している預かった指示（チャットごとに 1 つ。画面の中だけで持ち、保存しない） */
export interface HeldEdit {
  /** 預かった指示の ID */
  id: string;
  /** 送る順番（1 から。帯に「n 件目」と出す） */
  position: number;
  /** 書き直しを始めたときの文と添付（入力欄に入れる） */
  text: string;
  attachments: Attachment[];
}

const edits = createCell<ReadonlyMap<number, HeldEdit>>(new Map());

/** 預かった指示の書き直しを始める（吹き出しの鉛筆。チャット欄が書き直しの欄に入れ替わる） */
export function startHeldEdit(chatId: number, edit: HeldEdit) {
  // 書き直している間は、タブを裏に回しても会話の欄を止めない（書き直しの欄と、送る順を止めておく知らせを続ける）
  setKeepAlive(chatId, "heldEdit", true);
  edits.set((prev) => new Map(prev).set(chatId, edit));
}

/** 書き直しを終える（保存した・やめた） */
export function endHeldEdit(chatId: number) {
  if (!edits.get().has(chatId)) return;
  setKeepAlive(chatId, "heldEdit", false);
  edits.set((prev) => {
    const next = new Map(prev);
    next.delete(chatId);
    return next;
  });
}

/** そのチャットで書き直している預かった指示（なければ null） */
export function useHeldEdit(chatId: number): HeldEdit | null {
  return useCell(edits, (map) => map.get(chatId) ?? null);
}
