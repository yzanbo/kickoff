import type { DragEvent } from "react";
import { ensureAllRows } from "@/foundation/ui/hooks/useProgressiveRows";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { dragKind, useDragging } from "@/foundation/ui/kit/drag/dragKind";
import { useDropTarget, useDropTargets, type DropRules } from "@/foundation/ui/kit/drag/useDropTargets";

// チャットの一覧のドラッグの種類と中身（サイドバー・ボード・タブのまとまりで共通。仕組みは kit/drag）

/** 送る前の新しいチャット（下書き）を指すもの（どのボード・チャット欄のどのタブか） */
export interface DraftRef {
  panel: string;
  key: string;
}

/** チャット（中身はチャットの ID） */
export const CHAT_DRAG = dragKind<number>("application/x-kickoff-run", {
  write: String,
  read: (raw) => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : undefined;
  },
});

/** 下書き（中身は DraftRef） */
export const DRAFT_DRAG = dragKind<DraftRef>("application/x-kickoff-draft", {
  write: (draft) => JSON.stringify({ panel: draft.panel, key: draft.key }),
  read: (raw) => {
    try {
      const d = JSON.parse(raw) as Partial<DraftRef>;
      return typeof d.panel === "string" && typeof d.key === "string" ? { panel: d.panel, key: d.key } : undefined;
    } catch {
      return undefined;
    }
  },
});

/** 並べ替えのドラッグの種類（グループ・タブのまとまりの札 / プロジェクト） */
export const GROUP_DRAG_TYPE = "application/x-kickoff-group";
export const PROJECT_DRAG_TYPE = "application/x-kickoff-project";

/** いまドラッグしているチャットの ID（ドラッグの間だけ。dragover で受けるかを決める。チャットの手動の並べ替えなど） */
export const draggingChat = (): number | undefined => CHAT_DRAG.current();

/** 一覧の行のドラッグの絵を出し、次の回にまだ描いていない一覧の行もすべて描く（落とす先は並んだ行・カードの位置で決める） */
export const startRowDrag = (e: DragEvent, after?: () => void) => startDragGhost(e, { after: () => (ensureAllRows(), after?.()) });

/** チャットのドラッグを始める（落とし先でチャットの ID を受け取れるようにする）。ドラッグ中の見た目の state は次の回（after） */
export function startChatDrag(e: DragEvent, chatId: number, after?: () => void) {
  CHAT_DRAG.start(e, chatId);
  startRowDrag(e, after);
}

/** 下書きのドラッグを始める */
export function startDraftDrag(e: DragEvent, draft: DraftRef) {
  DRAFT_DRAG.start(e, draft);
  startRowDrag(e);
}

/** いまチャットをドラッグしているか（ドラッグの間だけ出す落とし先。アーカイブ済みのまとまりがないときの「アーカイブ済み」など） */
export const useChatDragging = (): boolean => useDragging(CHAT_DRAG);

/** チャットを落とせる所がいくつもあるとき（key で見分ける。サイドバーの丸の列の、プロジェクトごとの丸など） */
export const useChatDropTargets = <K>(onDrop: (chatId: number, key: K) => void, rules?: DropRules<number, K>) => useDropTargets(CHAT_DRAG, onDrop, rules);

/** チャットを落とせる所（サイドバーの「アーカイブ済み」など、グループ以外の落とし先。下書き・グループ・プロジェクトのドラッグは受けない） */
export const useChatDropTarget = (onDrop: (chatId: number) => void, rules?: DropRules<number, true>) => useDropTarget(CHAT_DRAG, onDrop, rules);
