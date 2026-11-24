// 送信待ちの一覧の中の部品（見出し・行・印の線・メニュー）が読む口（QueuedMessages が配る）
import { createContext, useContext } from "react";
import type { QueueController, QueueView } from "./queueController";
import type { useQueueDrag } from "./useQueueDrag";
import type { useQueuedEdits } from "./useQueuedEdits";
import type { useQueueSelection } from "./useQueueSelection";

export interface QueueActions {
  chatId: number;
  c: QueueController;
  /** 画面に出す並び（先回りを重ねたもの） */
  view: QueueView;
  selection: ReturnType<typeof useQueueSelection>;
  edit: ReturnType<typeof useQueuedEdits>;
  dnd: ReturnType<typeof useQueueDrag>;
  /** 一覧を開く（挟んだあと。たたんでいれば開いて見せる） */
  open(): void;
  /**
   * 別のチャットで聞く（右クリック。remove なら送信待ちから外す = 移す）。新しいチャットはパネルの外では、子チャットは作れないところでは undefined
   */
  ask: { newChat?: (ids: string[], remove: boolean) => void; child?: (ids: string[], remove: boolean, inherit: boolean) => void };
}

export const QueueActionsContext = createContext<QueueActions | null>(null);

export function useQueueActions(): QueueActions {
  const value = useContext(QueueActionsContext);
  if (!value) throw new Error("送信待ちの一覧の外では使えません");
  return value;
}
