// 画面のツールの文の口: Kickoff の AI のツールの表示の表を拡張点 aiToolViews で受け（app/renderer/registry.ts が入れる）、
// Claude Code の表と合わせた toolText() を 1 回だけ作る
import { aiToolId, type AiToolView } from "@shared/foundation/aiToolView";
import { createToolText, type ToolText } from "@shared/chat/toolText";
import { definePoint } from "@/foundation/ui/points";

/** Kickoff の AI のツールの表示の表（各機能の @shared/<機能>/tools.ts の行） */
export const aiToolViews = definePoint<AiToolView>("aiToolViews", { key: aiToolId });

let made: { from: readonly AiToolView[]; text: ToolText } | null = null;

/** ツールの文の関数（入れた表が変わったときだけ作り直す。テストが表を入れ替えるため） */
export function toolText(): ToolText {
  const items = aiToolViews.items();
  if (made?.from !== items) made = { from: items, text: createToolText(items) };
  return made.text;
}
