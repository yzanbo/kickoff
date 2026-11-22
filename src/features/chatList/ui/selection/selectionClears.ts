import { commandHandler } from "@/foundation/ui/commands";

/** Esc で選ぶのをやめる（コマンド chatList.clearSelection が呼ぶ。SelectionBar が選んでいる間だけ置く。選んでいる欄すべて） */
export const selectionClears = commandHandler();
